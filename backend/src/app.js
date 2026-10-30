/**
 * Express Application Assembly
 * Mounts universal system core routes, adapter routes, health routes, quality routes, usage routes, experience routes, intelligence routes, telemetry routes, audit routes, static files, and legacy router.
 */

const express = require('express');
const path = require('path');
const { SystemRegistry } = require('./registry/SystemRegistry');
const { SystemExecutionService } = require('./service/SystemExecutionService');
const { HealthCheckEngine } = require('./health/HealthCheckEngine');
const { QualityTestRunner } = require('./quality/QualityTestRunner');
const { UsageEventCollector } = require('./usage/UsageEventCollector');
const { ExperienceStore } = require('./experience/ExperienceStore');
const { IntelligenceService } = require('./intelligence/IntelligenceService');
const AlertingService = require('./alerting/AlertingService');
const ReportingService = require('./reporting/ReportingService');
const OrchestrationService = require('./orchestration/OrchestrationService');
const OnboardingService = require('./onboarding/OnboardingService');
const { AgentRegistry } = require('./agent/AgentRegistry');
const { AgentService } = require('./agent/AgentService');
const RemediationService = require('./remediation/RemediationService');
const RuntimeService = require('./runtime/RuntimeService');
const EventService = require('./events/EventService');
const { WorkflowService } = require('./workflow/WorkflowService');

const { createSystemRouter, systemRegistry, executionService } = require('./api/systemRoutes');
const { createAdapterRouter, defaultAdapterRegistry } = require('./api/adapterRoutes');
const { createHealthRouter, defaultEngine } = require('./api/healthRoutes');
const { createQualityRouter, defaultRunner } = require('./api/qualityRoutes');
const { createUsageRouter, defaultCollector } = require('./api/usageRoutes');
const { createExperienceRouter, defaultStore } = require('./api/experienceRoutes');
const { createIntelligenceRouter, defaultService } = require('./api/intelligenceRoutes');
const alertingRouter = require('./api/alertingRoutes');
const reportingRouter = require('./api/reportingRoutes');
const orchestrationRouter = require('./api/orchestrationRoutes');
const onboardingRouter = require('./api/onboardingRoutes');
const agentRouter = require('./api/agentRoutes');
const registryRouter = require('./api/registryRoutes');
const remediationRouter = require('./api/remediationRoutes');
const runtimeRouter = require('./api/runtimeRoutes');
const eventRouter = require('./api/eventRoutes');
const telemetryRouter = require('./api/telemetryRoutes');
const auditRouter = require('./api/auditRoutes');
const operationsRouter = require('./api/operationsRoutes');
const workflowRouter = require('./api/workflowRoutes');
const AgentMonitoringService = require('./monitoring/AgentMonitoringService');
const { createMonitoringRouter } = require('./api/monitoringRoutes');
const OperationalAnalyticsService = require('./analytics/OperationalAnalyticsService');
const { createAnalyticsRouter } = require('./api/analyticsRoutes');
const { AutomationPolicyEngine } = require('./automation/AutomationPolicyEngine');
const { AutomationDecisionService } = require('./automation/AutomationDecisionService');
const { IntelligentWorkflowOrchestrator } = require('./automation/IntelligentWorkflowOrchestrator');
const { createAutomationRouter } = require('./api/automationRoutes');
const { AgentDependencyService } = require('./dependencies/AgentDependencyService');
const { DependencyGraphService } = require('./dependencies/DependencyGraphService');
const { BlastRadiusAnalyzer } = require('./dependencies/BlastRadiusAnalyzer');
const { RootCauseAnalyzer } = require('./dependencies/RootCauseAnalyzer');
const { createDependencyRouter } = require('./api/dependencyRoutes');
const { AgentKnowledgeGraphService } = require('./knowledge/AgentKnowledgeGraphService');
const { KnowledgeGraphBuilder } = require('./knowledge/KnowledgeGraphBuilder');
const { InvestigationContextService } = require('./knowledge/InvestigationContextService');
const { SimilarIncidentAnalyzer } = require('./knowledge/SimilarIncidentAnalyzer');
const { OperationalSearchService } = require('./knowledge/OperationalSearchService');
const { createKnowledgeRouter } = require('./api/knowledgeRoutes');
const { AgentWatchtowerCommandCenterService } = require('./commandcenter/AgentWatchtowerCommandCenterService');
const { createCommandCenterRouter } = require('./api/commandCenterRoutes');
const { IntelligentResponseCenterService } = require('./response/IntelligentResponseCenterService');
const { createResponseRouter } = require('./api/responseRoutes');
const { FleetIntelligenceService } = require('./intelligence/FleetIntelligenceService');
const { createFleetIntelligenceRouter } = require('./api/fleetIntelligenceRoutes');
const { EarlyWarningCenterService } = require('./earlywarning/EarlyWarningCenterService');
const { createEarlyWarningRouter } = require('./api/earlyWarningRoutes');
const { DecisionIntelligenceService } = require('./decision/DecisionIntelligenceService');
const { createDecisionIntelligenceRouter } = require('./api/decisionIntelligenceRoutes');
const { SimulationIntelligenceService } = require('./simulation/SimulationIntelligenceService');
const { createSimulationRouter } = require('./api/simulationRoutes');
const { AdaptiveResponseService } = require('./adaptive-response/AdaptiveResponseService');
const { createAdaptiveResponseRouter } = require('./api/adaptiveResponseRoutes');
const { ContinuousImprovementService } = require('./improvement/ContinuousImprovementService');
const { createImprovementRouter } = require('./api/improvementRoutes');
const OperationalSummaryService = require('./intelligence/OperationalSummaryService');
const { AgentFramework } = require('./framework/AgentFramework');
const { ReasoningService } = require('./reasoning/ReasoningService');
const { McpService } = require('./mcp/McpService');
const frameworkRouter = require('./api/frameworkRoutes');
const reasoningRouter = require('./api/reasoningRoutes');
const mcpRouter = require('./api/mcpRoutes');
const incidentRouter = require('./api/incidentRoutes');
const legacyAgentRouter = require('../agent');

const { correlationMiddleware } = require('./middleware/correlationMiddleware');
const { tenantMiddleware } = require('./middleware/tenantMiddleware');
const { requireRole, ROLES } = require('./middleware/authMiddleware');
const { telemetryService } = require('./telemetry/TelemetryService');
const { defaultPersistenceManager } = require('./persistence/PersistenceManager');
const { auditLogService } = require('./audit/AuditLogService');
const { configurationService } = require('./config/ConfigurationService');
const { defaultPlatformLifecycleService } = require('./lifecycle/PlatformLifecycleService');
const { defaultStartupCoordinator } = require('./lifecycle/StartupCoordinator');
const { defaultShutdownCoordinator } = require('./lifecycle/ShutdownCoordinator');
const { defaultDependencyRegistry } = require('./operations/DependencyRegistry');
const { defaultBackupService } = require('./persistence/BackupService');
const { defaultDiagnosticsService } = require('./operations/DiagnosticsService');
const { sseManager } = require('./events/SSEManager');

defaultDependencyRegistry.registerDependency('persistence', async () => {
    const status = defaultPersistenceManager.getStatus();
    return { status: status.status === 'OPERATIONAL' ? 'UP' : 'DEGRADED', details: status };
});
defaultDependencyRegistry.registerDependency('telemetry', async () => {
    const stats = typeof telemetryService.getOverview === 'function' ? telemetryService.getOverview() : {};
    return { status: 'UP', details: stats };
});
defaultDependencyRegistry.registerDependency('audit', async () => {
    const stats = auditLogService.getStats();
    return { status: 'UP', details: stats };
});
defaultDependencyRegistry.registerDependency('event_stream', async () => {
    const count = sseManager.getClientCount();
    return { status: 'UP', details: { activeClients: count } };
});
defaultDependencyRegistry.registerDependency('configuration', async () => {
    const cfg = configurationService.getConfig();
    return { status: 'UP', details: { env: cfg.platform.environment } };
});
defaultDependencyRegistry.registerDependency('alerting', async () => {
    return { status: 'UP', details: { ready: true } };
});
defaultDependencyRegistry.registerDependency('remediation', async () => {
    return { status: 'UP', details: { ready: true } };
});


const defaultAlertingService = new AlertingService({
    intelligenceService: defaultService,
    healthService: defaultEngine,
    qualityStore: defaultRunner.qualityStore,
    usageStore: defaultCollector.usageStore,
    experienceStore: defaultStore
});

const defaultReportingService = new ReportingService({
    systemRegistry,
    healthEngine: defaultEngine,
    qualityRunner: defaultRunner,
    usageCollector: defaultCollector,
    experienceStore: defaultStore,
    intelligenceService: defaultService,
    alertingService: defaultAlertingService
});

const defaultOrchestrationService = new OrchestrationService({
    systemRegistry,
    healthEngine: defaultEngine,
    qualityRunner: defaultRunner,
    usageCollector: defaultCollector,
    experienceStore: defaultStore,
    intelligenceService: defaultService,
    alertingService: defaultAlertingService,
    reportingService: defaultReportingService
});

const defaultOnboardingService = new OnboardingService({
    systemRegistry,
    adapterRegistry: defaultAdapterRegistry,
    executionService,
    healthEngine: defaultEngine,
    qualityRunner: defaultRunner,
    usageCollector: defaultCollector,
    experienceStore: defaultStore,
    intelligenceService: defaultService,
    alertingService: defaultAlertingService,
    reportingService: defaultReportingService,
    orchestrationService: defaultOrchestrationService
});

const defaultAgentService = new AgentService({
    systemRegistry,
    executionService,
    healthEngine: defaultEngine,
    qualityRunner: defaultRunner,
    usageCollector: defaultCollector,
    intelligenceService: defaultService,
    alertingService: defaultAlertingService,
    persistenceManager: defaultPersistenceManager
});

const defaultRemediationService = new RemediationService({
    systemRegistry,
    executionService,
    healthEngine: defaultEngine,
    qualityRunner: defaultRunner,
    intelligenceService: defaultService,
    alertingService: defaultAlertingService
});

const defaultRuntimeService = new RuntimeService({
    systemRegistry,
    executionService,
    healthEngine: defaultEngine,
    alertingService: defaultAlertingService,
    remediationService: defaultRemediationService,
    orchestrationService: defaultOrchestrationService
});

const defaultEventService = new EventService({
    systemRegistry,
    runtimeService: defaultRuntimeService,
    healthEngine: defaultEngine,
    alertingService: defaultAlertingService,
    remediationService: defaultRemediationService,
    orchestrationService: defaultOrchestrationService,
    reportingService: defaultReportingService
});

function createApp(options = {}) {
    let registry, service, adapterRegistry, healthEngine, qualityRunner, usageCollector, experienceStore, intelligenceService, alertingService, reportingService, orchestrationService, onboardingService, agentService, remediationService, runtimeService, eventService;

    if (options instanceof SystemRegistry) {
        registry = options;
        usageCollector = new UsageEventCollector();
        service = new SystemExecutionService({ systemRegistry: registry, allowLocalhost: true, usageCollector });
        adapterRegistry = defaultAdapterRegistry;
        healthEngine = new HealthCheckEngine({ systemRegistry: registry, executionService: service, usageCollector });
        qualityRunner = new QualityTestRunner({ systemExecutionService: service, usageCollector });
        experienceStore = new ExperienceStore({ systemRegistry: registry });
        intelligenceService = new IntelligenceService({
            systemRegistry: registry,
            healthStore: healthEngine.healthStore,
            qualityStore: qualityRunner.qualityStore,
            usageStore: usageCollector.usageStore,
            experienceStore
        });
        alertingService = new AlertingService({
            intelligenceService,
            healthService: healthEngine,
            qualityStore: qualityRunner.qualityStore,
            usageStore: usageCollector.usageStore,
            experienceStore
        });
        reportingService = new ReportingService({
            systemRegistry: registry,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService
        });
        orchestrationService = new OrchestrationService({
            systemRegistry: registry,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService,
            reportingService
        });
        onboardingService = new OnboardingService({
            systemRegistry: registry,
            adapterRegistry,
            executionService: service,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService,
            reportingService,
            orchestrationService
        });
        agentService = new AgentService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            qualityRunner,
            usageCollector,
            intelligenceService,
            alertingService,
            persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
        });
        remediationService = new RemediationService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            qualityRunner,
            intelligenceService,
            alertingService
        });
        runtimeService = new RuntimeService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            alertingService,
            remediationService,
            orchestrationService
        });
        eventService = new EventService({
            systemRegistry: registry,
            runtimeService,
            healthEngine,
            alertingService,
            remediationService,
            orchestrationService,
            reportingService
        });
    } else if (options && typeof options === 'object') {
        registry = options.systemRegistry || systemRegistry;
        usageCollector = options.usageCollector || new UsageEventCollector();
        service = options.executionService || new SystemExecutionService({ systemRegistry: registry, allowLocalhost: true, usageCollector });
        adapterRegistry = options.adapterRegistry || defaultAdapterRegistry;
        healthEngine = options.healthEngine || new HealthCheckEngine({ systemRegistry: registry, executionService: service, usageCollector });
        qualityRunner = options.qualityRunner || new QualityTestRunner({ systemExecutionService: service, usageCollector });
        experienceStore = options.experienceStore || new ExperienceStore({ systemRegistry: registry });
        intelligenceService = options.intelligenceService || new IntelligenceService({
            systemRegistry: registry,
            healthStore: healthEngine.healthStore,
            qualityStore: qualityRunner.qualityStore,
            usageStore: usageCollector.usageStore,
            experienceStore
        });
        alertingService = options.alertingService || new AlertingService({
            intelligenceService,
            healthService: healthEngine,
            qualityStore: qualityRunner.qualityStore,
            usageStore: usageCollector.usageStore,
            experienceStore
        });
        reportingService = options.reportingService || new ReportingService({
            systemRegistry: registry,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService
        });
        orchestrationService = options.orchestrationService || new OrchestrationService({
            systemRegistry: registry,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService,
            reportingService
        });
        onboardingService = options.onboardingService || new OnboardingService({
            systemRegistry: registry,
            adapterRegistry,
            executionService: service,
            healthEngine,
            qualityRunner,
            usageCollector,
            experienceStore,
            intelligenceService,
            alertingService,
            reportingService,
            orchestrationService
        });
        agentService = options.agentService || new AgentService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            qualityRunner,
            usageCollector,
            intelligenceService,
            alertingService,
            persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
        });
        remediationService = options.remediationService || new RemediationService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            qualityRunner,
            intelligenceService,
            alertingService
        });
        runtimeService = options.runtimeService || new RuntimeService({
            systemRegistry: registry,
            executionService: service,
            healthEngine,
            alertingService,
            remediationService,
            orchestrationService
        });
        eventService = options.eventService || new EventService({
            systemRegistry: registry,
            runtimeService,
            healthEngine,
            alertingService,
            remediationService,
            orchestrationService,
            reportingService
        });
    } else {
        registry = systemRegistry;
        usageCollector = defaultCollector;
        service = executionService;
        service.usageCollector = usageCollector;
        adapterRegistry = defaultAdapterRegistry;
        healthEngine = defaultEngine;
        healthEngine.usageCollector = usageCollector;
        qualityRunner = defaultRunner;
        qualityRunner.usageCollector = usageCollector;
        experienceStore = defaultStore;
        intelligenceService = defaultService;
        intelligenceService.healthStore = healthEngine.healthStore;
        intelligenceService.qualityStore = qualityRunner.qualityStore;
        intelligenceService.usageStore = usageCollector.usageStore;
        intelligenceService.experienceStore = experienceStore;
        alertingService = defaultAlertingService;
        reportingService = defaultReportingService;
        orchestrationService = defaultOrchestrationService;
        onboardingService = defaultOnboardingService;
        agentService = defaultAgentService;
        remediationService = defaultRemediationService;
        runtimeService = defaultRuntimeService;
        eventService = defaultEventService;
    }

    // Attach application-state persistence (existing `agent_data` table in
    // mysql mode, memory/file otherwise) so every agent registration, system
    // registration, and update is stored in the configured database.
    // Best-effort: persistence failures never break registration flows.
    try {
        const registryPersistenceManager =
            (options && (options.persistenceManager || options.persistence)) || defaultPersistenceManager;
        if (registry && typeof registry.setPersistenceManager === 'function') {
            registry.setPersistenceManager(registryPersistenceManager);
        }
        if (agentService && !agentService.persistenceManager && registryPersistenceManager) {
            agentService.persistenceManager = registryPersistenceManager;
        }
    } catch (_) {}

    let workflowService = options.workflowService || new WorkflowService({
        agentService,
        systemRegistry: registry,
        executionService: service,
        healthEngine,
        alertingService,
        remediationService
    });

    let telemetryIngestionService = options.telemetryIngestionService || new (require('./telemetry/TelemetryIngestionService').TelemetryIngestionService)({
        systemRegistry: registry,
        healthEngine,
        alertingService
    });

    let agentMonitoringService = options.agentMonitoringService || new AgentMonitoringService({
        agentService,
        systemRegistry: registry,
        alertingService,
        eventService,
        sseManager,
        telemetryService,
        telemetryIngestionService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    let operationalSummaryService = options.operationalSummaryService || new OperationalSummaryService({
        agentService,
        agentMonitoringService,
        systemRegistry: registry,
        alertingService,
        healthEngine
    });

    let agentFramework = options.agentFramework || new AgentFramework({
        agentRegistry: registry,
        agentService
    });

    let reasoningService = options.reasoningService || new ReasoningService({
        healthEngine,
        agentService,
        alertingService,
        remediationService
    });

    let mcpService = options.mcpService || new McpService();

    let externalAgentOnboardingService = options.externalAgentOnboardingService || new (require('./onboarding/ExternalAgentOnboardingService').ExternalAgentOnboardingService)({
        systemRegistry: registry,
        healthEngine
    });

    const { PredictiveBaselineEngine } = require('./intelligence/PredictiveBaselineEngine');
    const { AnomalyDetectionService } = require('./intelligence/AnomalyDetectionService');
    const { PredictiveRiskEngine } = require('./intelligence/PredictiveRiskEngine');
    const { PredictiveRemediationCoordinator } = require('./intelligence/PredictiveRemediationCoordinator');

    let predictiveBaselineEngine = options.predictiveBaselineEngine || new PredictiveBaselineEngine({ store: agentMonitoringService.store });
    let anomalyDetectionService = options.anomalyDetectionService || new AnomalyDetectionService({ store: agentMonitoringService.store, baselineEngine: predictiveBaselineEngine });
    let predictiveRiskEngine = options.predictiveRiskEngine || new PredictiveRiskEngine({ store: agentMonitoringService.store, baselineEngine: predictiveBaselineEngine, anomalyService: anomalyDetectionService });
    let predictiveRemediationCoordinator = options.predictiveRemediationCoordinator || new PredictiveRemediationCoordinator({
        monitoringService: agentMonitoringService,
        riskEngine: predictiveRiskEngine,
        remediationService,
        auditService: auditLogService,
        store: agentMonitoringService.store
    });

    let operationalAnalyticsService = options.operationalAnalyticsService || new OperationalAnalyticsService({
        store: agentMonitoringService.store,
        systemRegistry: registry,
        anomalyService: anomalyDetectionService,
        riskEngine: predictiveRiskEngine,
        remediationService,
        telemetryService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    let automationPolicyEngine = options.automationPolicyEngine || new AutomationPolicyEngine({
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    let automationDecisionService = options.automationDecisionService || new AutomationDecisionService({
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager,
        auditService: auditLogService
    });

    let intelligentWorkflowOrchestrator = options.intelligentWorkflowOrchestrator || new IntelligentWorkflowOrchestrator({
        store: agentMonitoringService.store,
        systemRegistry: registry,
        policyEngine: automationPolicyEngine,
        decisionService: automationDecisionService,
        workflowService,
        remediationService,
        alertingService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    let agentDependencyService = options.agentDependencyService || new AgentDependencyService({
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager,
        auditLogService,
        agentRegistry: registry
    });

    let dependencyGraphService = options.dependencyGraphService || new DependencyGraphService({
        dependencyService: agentDependencyService,
        monitoringService: agentMonitoringService,
        agentRegistry: registry
    });

    let blastRadiusAnalyzer = options.blastRadiusAnalyzer || new BlastRadiusAnalyzer({
        graphService: dependencyGraphService,
        monitoringService: agentMonitoringService,
        workflowService,
        automationEngine: automationPolicyEngine
    });

    let rootCauseAnalyzer = options.rootCauseAnalyzer || new RootCauseAnalyzer({
        graphService: dependencyGraphService,
        monitoringService: agentMonitoringService
    });

    let agentKnowledgeGraphService = options.agentKnowledgeGraphService || new AgentKnowledgeGraphService({
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager,
        auditLogService
    });

    let knowledgeGraphBuilder = options.knowledgeGraphBuilder || new KnowledgeGraphBuilder({
        graphService: agentKnowledgeGraphService,
        monitoringService: agentMonitoringService,
        agentRegistry: registry,
        dependencyService: agentDependencyService,
        automationEngine: automationPolicyEngine,
        decisionService: automationDecisionService,
        workflowService,
        remediationService,
        alertingService,
        auditService: auditLogService
    });

    let similarIncidentAnalyzer = options.similarIncidentAnalyzer || new SimilarIncidentAnalyzer({
        monitoringService: agentMonitoringService
    });

    let investigationContextService = options.investigationContextService || new InvestigationContextService({
        graphService: agentKnowledgeGraphService,
        graphBuilder: knowledgeGraphBuilder,
        monitoringService: agentMonitoringService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        decisionService: automationDecisionService,
        orchestrator: intelligentWorkflowOrchestrator,
        remediationService,
        auditService: auditLogService,
        similarIncidentAnalyzer
    });

    let operationalSearchService = options.operationalSearchService || new OperationalSearchService({
        monitoringService: agentMonitoringService,
        dependencyService: agentDependencyService,
        decisionService: automationDecisionService,
        auditService: auditLogService
    });

    let commandCenterService = options.commandCenterService || options.agentWatchtowerCommandCenterService || new AgentWatchtowerCommandCenterService({
        monitoringService: agentMonitoringService,
        agentRegistry: registry,
        agentService,
        telemetryIngestionService,
        alertingService,
        knowledgeGraphService: agentKnowledgeGraphService,
        knowledgeGraphBuilder,
        investigationContextService,
        similarIncidentAnalyzer,
        operationalSearchService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        baselineEngine: predictiveBaselineEngine,
        anomalyService: anomalyDetectionService,
        riskEngine: predictiveRiskEngine,
        remediationService,
        operationalAnalyticsService,
        automationPolicyEngine,
        automationDecisionService,
        intelligentWorkflowOrchestrator,
        auditService: auditLogService,
        agentDependencyService
    });
    // Keep injected singletons in sync when default services are used.
    try {
        commandCenterService.telemetryIngestionService = commandCenterService.telemetryIngestionService || telemetryIngestionService;
        commandCenterService.alertingService = commandCenterService.alertingService || alertingService;
    } catch (_) {}

    let responseCenterService = options.responseCenterService || options.intelligentResponseCenterService || new IntelligentResponseCenterService({
        monitoringService: agentMonitoringService,
        remediationService,
        intelligentWorkflowOrchestrator,
        automationPolicyEngine,
        automationDecisionService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        investigationContextService,
        agentKnowledgeGraphService,
        knowledgeGraphBuilder,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager,
        sseManager
    });

    let fleetIntelligenceService = options.fleetIntelligenceService || new FleetIntelligenceService({
        monitoringService: agentMonitoringService,
        dependencyGraphService,
        responseCenterService,
        agentKnowledgeGraphService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    let earlyWarningCenterService = options.earlyWarningCenterService || new EarlyWarningCenterService({
        monitoringService: agentMonitoringService,
        baselineEngine: predictiveBaselineEngine,
        anomalyService: anomalyDetectionService,
        riskEngine: predictiveRiskEngine,
        fleetIntelligenceService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        responseCenterService,
        investigationContextService,
        similarIncidentAnalyzer,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });

    const { AgentMasterRegistrySource } = require('./registry/AgentMasterRegistrySource');
    const agentMasterRegistrySource = options.agentMasterRegistrySource || new AgentMasterRegistrySource({
        readService: defaultPersistenceManager.getDatabaseService()
    });
    if (agentService) {
        agentService.masterSource = agentMasterRegistrySource;
        if (typeof agentService.loadMasterAgents === 'function') {
            agentService.loadMasterAgents().catch(() => {});
        }
    }
    const { AgentMasterEvaluator } = require('./registry/AgentMasterEvaluator');
    const agentMasterEvaluator = options.agentMasterEvaluator || new AgentMasterEvaluator({
        masterSource: agentMasterRegistrySource,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager,
        monitoringService: agentMonitoringService
    });

    const app = express();
    app.set('systemRegistry', registry);
    app.set('healthEngine', healthEngine);
    app.set('alertingService', alertingService);
    app.set('reportingService', reportingService);
    app.set('orchestrationService', orchestrationService);
    app.set('onboardingService', onboardingService);
    app.set('agentService', agentService);
    app.set('remediationService', remediationService);
    app.set('runtimeService', runtimeService);
    app.set('eventService', eventService);
    app.set('workflowService', workflowService);
    app.set('agentMonitoringService', agentMonitoringService);
    app.set('agentMasterRegistrySource', agentMasterRegistrySource);
    app.set('agentMasterEvaluator', agentMasterEvaluator);
    app.set('operationalSummaryService', operationalSummaryService);
    app.set('agentFramework', agentFramework);
    app.set('reasoningService', reasoningService);
    app.set('mcpService', mcpService);
    app.set('telemetryIngestionService', telemetryIngestionService);
    app.set('externalAgentOnboardingService', externalAgentOnboardingService);
    app.set('predictiveBaselineEngine', predictiveBaselineEngine);
    app.set('anomalyDetectionService', anomalyDetectionService);
    app.set('predictiveRiskEngine', predictiveRiskEngine);
    app.set('predictiveRemediationCoordinator', predictiveRemediationCoordinator);
    app.set('operationalAnalyticsService', operationalAnalyticsService);
    app.set('automationPolicyEngine', automationPolicyEngine);
    app.set('automationDecisionService', automationDecisionService);
    app.set('intelligentWorkflowOrchestrator', intelligentWorkflowOrchestrator);
    app.set('agentDependencyService', agentDependencyService);
    app.set('dependencyGraphService', dependencyGraphService);
    app.set('blastRadiusAnalyzer', blastRadiusAnalyzer);
    app.set('rootCauseAnalyzer', rootCauseAnalyzer);
    app.set('agentKnowledgeGraphService', agentKnowledgeGraphService);
    app.set('knowledgeGraphBuilder', knowledgeGraphBuilder);
    app.set('investigationContextService', investigationContextService);
    app.set('similarIncidentAnalyzer', similarIncidentAnalyzer);
    app.set('operationalSearchService', operationalSearchService);
    app.set('commandCenterService', commandCenterService);
    app.set('responseCenterService', responseCenterService);
    app.set('fleetIntelligenceService', fleetIntelligenceService);
    app.set('earlyWarningCenterService', earlyWarningCenterService);

    let decisionIntelligenceService = options.decisionIntelligenceService || new DecisionIntelligenceService({
        monitoringService: agentMonitoringService,
        earlyWarningService: earlyWarningCenterService,
        earlyWarningCenterService,
        fleetIntelligenceService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        responseCenterService,
        knowledgeGraphService: agentKnowledgeGraphService,
        agentKnowledgeGraphService,
        similarIncidentAnalyzer,
        riskEngine: predictiveRiskEngine,
        predictiveRiskEngine,
        anomalyService: anomalyDetectionService,
        anomalyDetectionService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });
    app.set('decisionIntelligenceService', decisionIntelligenceService);

    let simulationIntelligenceService = options.simulationIntelligenceService || new SimulationIntelligenceService({
        monitoringService: agentMonitoringService,
        decisionService: decisionIntelligenceService,
        decisionIntelligenceService,
        earlyWarningService: earlyWarningCenterService,
        earlyWarningCenterService,
        fleetIntelligenceService,
        dependencyGraphService,
        blastRadiusAnalyzer,
        rootCauseAnalyzer,
        responseCenterService,
        knowledgeGraphService: agentKnowledgeGraphService,
        agentKnowledgeGraphService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });
    app.set('simulationIntelligenceService', simulationIntelligenceService);

    let adaptiveResponseService = options.adaptiveResponseService || new AdaptiveResponseService({
        monitoringService: agentMonitoringService,
        responseCenterService,
        decisionService: decisionIntelligenceService,
        decisionIntelligenceService,
        simulationService: simulationIntelligenceService,
        simulationIntelligenceService,
        fleetIntelligenceService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });
    app.set('adaptiveResponseService', adaptiveResponseService);

    let continuousImprovementService = options.continuousImprovementService || new ContinuousImprovementService({
        monitoringService: agentMonitoringService,
        adaptiveService: adaptiveResponseService,
        adaptiveResponseService,
        fleetService: fleetIntelligenceService,
        fleetIntelligenceService,
        earlyWarningService: earlyWarningCenterService,
        earlyWarningCenterService,
        riskEngine: predictiveRiskEngine,
        predictiveRiskEngine,
        dependencyGraphService,
        blastRadiusAnalyzer,
        knowledgeGraphService: agentKnowledgeGraphService,
        agentKnowledgeGraphService,
        auditService: auditLogService,
        persistenceManager: options.persistenceManager || options.persistence || defaultPersistenceManager
    });
    app.set('continuousImprovementService', continuousImprovementService);

    // Request correlation middleware
    app.use(correlationMiddleware());

    // Telemetry metric tracking middleware
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            telemetryService.recordHttpRequest(res.statusCode, duration);
        });
        next();
    });

    // CORS middleware: allow requests from standalone frontend, office remote server, etc.
    app.use((req, res, next) => {
        const origin = req.headers.origin || '*';
        res.setHeader('Access-Control-Allow-Origin', origin);
        if (req.headers.origin) {
            res.setHeader('Access-Control-Allow-Credentials', 'true');
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-role, x-user-role, x-tenant-id, x-correlation-id, x-client-name, mcp-session-id, Accept, Origin, X-Requested-With');
        if (req.method === 'OPTIONS') {
            return res.sendStatus(204);
        }
        next();
    });

    // Public Health Check Endpoint for office server & external monitors (e.g. GET /api/health and /health)
    app.get(['/api/health', '/health', '/api/v1/health'], (req, res) => {
        return res.status(200).json({
            status: 'healthy',
            service: 'agent-watchtower',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        });
    });

    // Multi-tenant middleware
    app.use(tenantMiddleware());

    // Body parsing middleware
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Automatic gzip response compression for payloads > 2KB
    const zlib = require('zlib');
    app.use((req, res, next) => {
        const acceptEncoding = req.headers['accept-encoding'] || '';
        if (!acceptEncoding.includes('gzip')) return next();
        const origSend = res.send;
        res.send = function (body) {
            if ((typeof body === 'string' && body.length > 2048) || (Buffer.isBuffer(body) && body.length > 2048)) {
                const buf = Buffer.isBuffer(body) ? body : Buffer.from(body, 'utf8');
                zlib.gzip(buf, (err, compressed) => {
                    if (err) return origSend.call(this, body);
                    res.setHeader('Content-Encoding', 'gzip');
                    res.removeHeader('Content-Length');
                    res.setHeader('Content-Length', compressed.length);
                    return origSend.call(this, compressed);
                });
                return;
            }
            return origSend.call(this, body);
        };
        next();
    });

    // Serve static files (including index.html frontend).
    const fs = require('fs');
    function getFrontendIndexPath() {
        const candidates = [
            path.join(__dirname, '..', '..', 'frontend', 'index.html'),
            path.join(__dirname, '..', 'frontend', 'index.html'),
            path.join(__dirname, 'frontend', 'index.html'),
            path.join(__dirname, '..', 'index.html'),
            path.join(__dirname, 'index.html'),
            typeof __BUNDLE_DIR__ !== 'undefined' && __BUNDLE_DIR__ ? path.join(__BUNDLE_DIR__, '..', 'frontend', 'index.html') : null,
            typeof __BUNDLE_DIR__ !== 'undefined' && __BUNDLE_DIR__ ? path.join(__BUNDLE_DIR__, 'frontend', 'index.html') : null,
            typeof __BUNDLE_DIR__ !== 'undefined' && __BUNDLE_DIR__ ? path.join(__BUNDLE_DIR__, 'index.html') : null
        ].filter(Boolean);
        for (const c of candidates) {
            try {
                if (fs.existsSync(c)) return c;
            } catch (_) {}
        }
        return candidates[0];
    }
    const resolvedIndex = getFrontendIndexPath();
    const resolvedFrontendDir = path.dirname(resolvedIndex);
    app.use(express.static(resolvedFrontendDir));
    app.get('/', (req, res, next) => { try { res.sendFile(resolvedIndex); } catch (e) { next(e); } });
    app.get('/index.html', (req, res, next) => { try { res.sendFile(resolvedIndex); } catch (e) { next(e); } });

    // Mount Universal System Routes
    const systemRouter = createSystemRouter(registry, service);
    app.use(systemRouter);

    // Mount Generic Adapter Routes
    const adapterRouter = createAdapterRouter(adapterRegistry);
    app.use(adapterRouter);

    // Mount Health Engine Routes
    const healthRouter = createHealthRouter(healthEngine);
    app.use(healthRouter);

    // Mount Quality Engine Routes
    const qualityRouter = createQualityRouter(qualityRunner);
    app.use(qualityRouter);

    // Mount Usage Analytics Routes
    const usageRouter = createUsageRouter(usageCollector);
    app.use(usageRouter);

    // Mount Client Experience Routes
    const experienceRouter = createExperienceRouter(experienceStore);
    app.use(experienceRouter);

    // Mount Intelligence Engine Routes
    const intelligenceRouter = createIntelligenceRouter(intelligenceService);
    app.use(intelligenceRouter);

    // Mount Alerting & Notification Routes
    app.use(alertingRouter);

    // Mount Reporting & Decision Dashboard Routes
    app.use(reportingRouter);

    // Mount Orchestration & Continuous Monitoring Routes
    app.use(orchestrationRouter);

    // Mount Universal System Onboarding & Configuration Routes
    app.use(onboardingRouter);

    // Mount Universal Agent Contract & Dynamic Agent Routes
    app.use(agentRouter);

    // Mount Agent Master Registry Routes (read-only nrkindex_trn.AGENT_MASTER_REGISTRY)
    app.use(registryRouter);

    // Mount Universal Autonomous Remediation & Self-Healing Routes
    app.use(remediationRouter);

    // Mount Universal Agent Runtime & Live Operations Routes
    app.use(runtimeRouter);

    // Mount Universal Event-Driven Control & Automation Routes
    app.use(eventRouter);

    // Mount Universal Workflow Automation & Intelligent Orchestration Routes
    app.use(workflowRouter);

    // Mount Phase 17 Agent Intelligence, Framework, Reasoning & MCP Routes
    app.use(frameworkRouter);
    app.use(reasoningRouter);
    app.use(mcpRouter);

    // Mount Phase 17 Agent Monitoring & Observability Routes
    const monitoringRouter = createMonitoringRouter(agentMonitoringService);
    app.use('/api/v1/monitoring', monitoringRouter);

    // Mount Phase 24 Operational Analytics Routes
    const analyticsRouter = createAnalyticsRouter(operationalAnalyticsService);
    app.use('/api/v1/analytics', analyticsRouter);

    // Mount Phase 25 Event-Driven Automation Routes
    const automationRouter = createAutomationRouter(intelligentWorkflowOrchestrator, automationPolicyEngine, automationDecisionService);
    app.use('/api/v1/automation', automationRouter);

    // Mount Phase 26 Dependency Intelligence & Topology Routes
    const dependencyRouter = createDependencyRouter(agentDependencyService, dependencyGraphService, blastRadiusAnalyzer, rootCauseAnalyzer);
    app.use('/api/v1/dependencies', dependencyRouter);

    // Mount Phase 27 Knowledge Graph & Investigation Intelligence Routes
    const knowledgeRouter = createKnowledgeRouter(agentKnowledgeGraphService, knowledgeGraphBuilder, investigationContextService, similarIncidentAnalyzer, operationalSearchService);
    app.use('/api/v1/knowledge', knowledgeRouter);

    // Mount Phase 28 Command Center & Operational Intelligence Routes
    const commandCenterRouter = createCommandCenterRouter(commandCenterService);
    app.use('/api/v1/command-center', commandCenterRouter);

    // Mount Phase 29 Autonomous Operations & Intelligent Response Center Routes
    const responseRouter = createResponseRouter(responseCenterService);
    app.use('/api/v1/response', responseRouter);

    // Mount Phase 30 Fleet Intelligence & Operational Learning Routes
    const fleetIntelligenceRouter = createFleetIntelligenceRouter(fleetIntelligenceService);
    app.use('/api/v1/fleet-intelligence', fleetIntelligenceRouter);

    // Mount Phase 31 Predictive Operations & Early Warning Center Routes
    const earlyWarningRouter = createEarlyWarningRouter(earlyWarningCenterService);
    app.use('/api/v1/early-warning', earlyWarningRouter);

    // Mount Phase 32 Operational Scenario & Decision Intelligence Center Routes (explicit full paths)
    const decisionIntelligenceRouter = createDecisionIntelligenceRouter(decisionIntelligenceService);
    app.use(decisionIntelligenceRouter);

    // Mount Phase 33 Operational Simulation & What-If Intelligence Center Routes (explicit full paths)
    const simulationRouter = createSimulationRouter(simulationIntelligenceService);
    app.use(simulationRouter);

    // Mount Phase 34 Adaptive Response Orchestration & Outcome Learning Routes (explicit full paths)
    const adaptiveResponseRouter = createAdaptiveResponseRouter(adaptiveResponseService);
    app.use(adaptiveResponseRouter);

    // Mount Phase 35 Continuous Improvement & Operational Governance Center Routes (explicit full paths)
    const improvementRouter = createImprovementRouter(continuousImprovementService);
    app.use(improvementRouter);

    // Mount Phase 22 Incident Management Routes
    app.use(incidentRouter);

    // Mount Telemetry & Observability Routes
    app.use(telemetryRouter);

    // Mount Central Audit Log Routes
    app.use(auditRouter);

    // Mount Production Operations & Platform Lifecycle Routes
    app.use(operationsRouter);

    // Mount Existing-Database Read-Only Routes (no raw SQL, allow-listed tables only)
    try {
        const { createDatabaseRouter } = require('./api/databaseRoutes');
        app.use(createDatabaseRouter());
    } catch (_) {}

    // Mount Legacy Router for backward compatibility
    app.use(legacyAgentRouter);
    app.set('platformLifecycleService', defaultPlatformLifecycleService);
    app.set('startupCoordinator', defaultStartupCoordinator);
    app.set('shutdownCoordinator', defaultShutdownCoordinator);
    app.set('dependencyRegistry', defaultDependencyRegistry);
    app.set('backupService', defaultBackupService);
    app.set('diagnosticsService', defaultDiagnosticsService);
    app.set('persistenceManager', defaultPersistenceManager);

    // Platform Export Endpoint
    app.get('/api/v1/platform/export', requireRole([ROLES.ADMIN]), async (req, res) => {
        try {
            const persistenceExport = await defaultPersistenceManager.export();
            const auditExport = auditLogService.exportEvents({ limit: 1000 });
            const configExport = configurationService.getConfig();

            res.json({
                success: true,
                schemaVersion: '1.0.0',
                exportedAt: new Date().toISOString(),
                platform: configExport.platform,
                collections: persistenceExport.collections,
                audit: auditExport,
                configuration: configExport
            });
        } catch (err) {
            res.status(500).json({ success: false, error: { message: err.message } });
        }
    });

    // Platform root status endpoint
    app.get('/api/platform/status', (req, res) => {
        res.status(200).json({
            success: true,
            status: 'operational',
            service: 'Universal Monitoring & Intelligence Platform Core',
            version: '12.0.0',
            registeredSystemsCount: registry.getAllSystems().length,
            registeredAdaptersCount: adapterRegistry.listAdapters().length
        });
    });

    // 404 Handler for undefined API routes
    app.use('/api/*', (req, res) => {
        res.status(404).json({
            success: false,
            error: `API route '${req.originalUrl}' not found`,
            code: 'NOT_FOUND'
        });
    });

    // Global Error Handling Middleware
    app.use((err, req, res, next) => {
        const statusCode = err.statusCode || 500;
        return res.status(statusCode).json({
            success: false,
            error: err.message || 'Internal Server Error',
            code: err.code || 'INTERNAL_SERVER_ERROR',
            errors: err.errors || []
        });
    });

    // Restore state from persistence safely
    defaultPersistenceManager.restoreApplicationState(app).catch(() => { });

    // Run startup lifecycle sequence
    defaultStartupCoordinator.runStartupSequence(app).catch(() => { });

    // Log startup audit event
    auditLogService.logEvent({
        eventType: 'PERSISTENCE_RESTORE',
        action: 'startup_restoration',
        actor: 'system',
        role: 'admin',
        tenantId: 'default-tenant',
        resourceType: 'platform',
        resourceId: 'global',
        outcome: 'SUCCESS',
        severity: 'INFO',
        correlationId: `corr_startup_${Date.now()}`,
        metadata: { mode: defaultPersistenceManager.mode }
    });

    return app;
}

module.exports = {
    createApp,
    systemRegistry,
    executionService,
    defaultEngine,
    defaultRunner,
    defaultCollector,
    defaultStore,
    defaultService,
    defaultAlertingService,
    defaultReportingService,
    defaultOrchestrationService,
    defaultOnboardingService,
    defaultAgentService,
    defaultRuntimeService,
    defaultEventService,
    defaultPlatformLifecycleService,
    defaultStartupCoordinator,
    defaultShutdownCoordinator,
    defaultDependencyRegistry,
    defaultBackupService,
    defaultDiagnosticsService
};
