const express = require('express');
const router = express.Router();



/**
 * Intelligent Rule-Based AI Engine for MyBlocks.in
 * Analyzes intent, keywords, and context to generate natural, professional responses.
 */
function processAgentMessage(rawInput) {
    const message = rawInput.trim();
    const lower = message.toLowerCase();

    // 1. GREETINGS & INTRODUCTIONS
    if (/^(hi|hello|hey|greetings|good\s*(morning|afternoon|evening)|howdy)\b/i.test(lower) || lower === 'hi' || lower === 'hello') {
        return "Hello! 👋 Welcome to **MyBlocks.in**.\n\nI am your **MyBlocks AI Assistant**, engineered to help you navigate our modular digital solutions, explore innovative project ideas, streamline business operations, and optimize customer workflows.\n\nHow may I assist your business today? You can try asking:\n- *\"Tell me about MyBlocks.in\"*\n- *\"Suggest a project idea\"*\n- *\"How can MyBlocks help scale my business?\"*\n- *\"Summarize my task\"*";
    }

    // 2. ABOUT MYBLOCKS.IN & COMPANY OVERVIEW
    if (lower.includes('myblocks') || lower.includes('company') || lower.includes('about us') || lower.includes('who are you') || lower.includes('what is myblocks')) {
        return "🏢 **About MyBlocks.in**\n\n**MyBlocks.in** is a modern digital technology and modular software solutions provider. We empower startups, enterprises, and innovators by delivering robust, plug-and-play digital building blocks that accelerate software engineering and business transformation.\n\n### Core Pillars:\n- 🧩 **Modular Architecture**: Build complex digital products rapidly using decoupled, reusable components.\n- ⚡ **High-Performance Engineering**: Scalable full-stack web applications, resilient backend microservices, and modern cloud deployment.\n- 🔒 **Enterprise-Grade Quality**: Strict security benchmarks, responsive design standards, and optimized performance metrics.\n- 💡 **Innovation Focused**: Bridging the gap between conceptual business ideas and production-ready applications.\n\nWhether you need bespoke web platforms, API microservices, or workflow automation, MyBlocks.in provides the foundation for sustainable digital growth.";
    }

    // 3. SERVICES & SOLUTIONS
    if (lower.includes('service') || lower.includes('services') || lower.includes('offer') || lower.includes('solution') || lower.includes('products') || lower.includes('what do you provide')) {
        return "🛠️ **Services & Capabilities at MyBlocks.in**\n\nWe provide end-to-end digital solutions tailored to modern enterprises:\n\n1. **Modular Web & Cloud Engineering**\n   - Custom, responsive web platforms built on modern frameworks.\n   - High-throughput REST & GraphQL APIs.\n   - Scalable cloud deployments and serverless integrations.\n\n2. **Business Workflow Automation**\n   - End-to-end process automation to eliminate repetitive operational overhead.\n   - System-to-system data synchronization and CRM/ERP integrations.\n\n3. **UI/UX Design Systems**\n   - Cohesive design tokens, component libraries, and intuitive digital experiences.\n   - Mobile-first, accessible, and conversion-optimized interfaces.\n\n4. **Consulting & Technical Strategy**\n   - Technology audits, architectural blueprints, and digital transformation roadmaps.\n\nNeed a custom quote or technical consultation? Let us know your project requirements!";
    }

    // 4. PROJECT IDEAS
    if (lower.includes('project idea') || lower.includes('project') || lower.includes('idea') || lower.includes('suggest') || lower.includes('build something') || lower.includes('innovation')) {
        const projectIdeas = [
            {
                title: "Modular Customer Knowledge Base & Self-Service Portal",
                problem: "Support teams waste 60% of their time answering repetitive Tier-1 customer questions.",
                solution: "A dynamic, searchable knowledge base featuring modular help cards, automated ticket routing, and intelligent answer suggestions.",
                stack: "Express.js REST APIs, modern reactive frontend, modular component widgets."
            },
            {
                title: "B2B SaaS Analytics & Revenue Health Dashboard",
                problem: "Business founders struggle to consolidate metrics across billing, marketing, and user activity.",
                solution: "An executive command center with interactive KPI blocks, automated churn indicators, and weekly PDF performance summaries.",
                stack: "Node.js data pipelines, chart visualization components, modular data transformers."
            },
            {
                title: "No-Code Micro-Landing Page Builder for Campaign Launches",
                problem: "Marketing teams depend heavily on engineers to launch simple event or promotional pages.",
                solution: "A block-based interface where marketers drag pre-approved hero banners, testimonial blocks, and lead forms into instant live pages.",
                stack: "Modular HTML/CSS templates, lightweight schema validation, instantaneous cloud hosting."
            },
            {
                title: "Omnichannel Customer Feedback & Sentiment Hub",
                problem: "Feedback from app reviews, support tickets, and surveys is scattered in silos.",
                solution: "A unified ingestion engine that groups feedback into actionable feature requests and generates daily sentiment briefs.",
                stack: "Webhooks, rule-based classification engine, executive summary generator."
            }
        ];

        // Select a featured idea and summarize the rest
        const featured = projectIdeas[Math.floor(Math.random() * projectIdeas.length)];

        return `💡 **Featured Project Concept from MyBlocks.in**\n\n### 🚀 **${featured.title}**\n- **Business Need**: ${featured.problem}\n- **Modular Solution**: ${featured.solution}\n- **Architecture**: ${featured.stack}\n\n**Next Steps to Execution**:\n1. Define MVP scope and user user-stories.\n2. Leverage MyBlocks modular components for rapid prototyping.\n3. Test with a small user cohort before full-scale deployment.\n\n*Would you like another project suggestion or guidance on implementing this concept?*`;
    }

    // 5. BUSINESS ASSISTANCE & STRATEGY
    if (lower.includes('business') || lower.includes('strategy') || lower.includes('growth') || lower.includes('scale') || lower.includes('operations') || lower.includes('efficiency')) {
        return "📈 **MyBlocks Business Growth & Operational Strategy**\n\nOptimizing business velocity requires strategic alignment between technology and operations:\n\n1. **Automate High-Frequency Low-Value Work**\n   - Identify tasks executed >10 times daily (invoicing, lead intake, status updates) and integrate automated hooks.\n\n2. **Adopt Modular Tech Architecture**\n   - Avoid monolithic systems that slow down feature releases. Modular micro-frontends and discrete APIs let you iterate without breaking existing workflows.\n\n3. **Tighten Customer Feedback Loops**\n   - Implement in-app feedback widgets to capture user friction points in real time. Continuous small enhancements beat delayed major overhauls.\n\n4. **Monitor Core Health Metrics**\n   - Track Customer Acquisition Cost (CAC), Lifetime Value (LTV), Monthly Recurring Revenue (MRR), and Churn rates weekly.\n\nNeed specific advice on your business model or operational bottleneck? Share your current challenge!";
    }

    // 6. CUSTOMER SUPPORT & INQUIRY GUIDANCE
    if (lower.includes('customer') || lower.includes('support') || lower.includes('client') || lower.includes('ticket') || lower.includes('help desk') || lower.includes('complaint')) {
        return "🤝 **MyBlocks Customer Experience & Support Framework**\n\nDelivering exceptional customer assistance hinges on consistency, clarity, and speed:\n\n- ⏱️ **First-Contact Resolution Target**: Strive to resolve 70%+ of routine inquiries on first contact within 15 minutes.\n- 📚 **Comprehensive Self-Service**: 80% of customers prefer self-service portals over waiting for live agents. Keep FAQs updated with clear steps.\n- 🎯 **Empathetic Communication**: Acknowledge the user's issue upfront, outline clear steps toward resolution, and set realistic time expectations.\n- 🔄 **Closed-Loop Feedback**: Always follow up with a quick 1-click rating to measure Customer Satisfaction (CSAT).\n\n**Need help drafting a response to a difficult customer inquiry?** Type your customer's query and I will draft a professional reply!";
    }

    // 7. TASK SUMMARIZATION
    if (lower.includes('summary') || lower.includes('summarize') || lower.includes('task') || lower.includes('recap') || lower.includes('brief') || lower.includes('tldr')) {
        // If the user provided content to summarize after the keyword
        const cleanContent = message
            .replace(/^(please\s*)?(summarize|summary of|task summary|recap|tldr)(\s*this|\s*the following|\s*task)?(\s*:)?/i, '')
            .trim();

        if (cleanContent.length > 20) {
            const sentences = cleanContent.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
            const keyPoints = sentences.slice(0, 4).map((s, i) => `${i + 1}. ${s}`).join('\n');

            return `📋 **Executive Task Summary**\n\n**Context & Core Objective:**\n${sentences[0] || cleanContent.substring(0, 100)}\n\n**Key Highlights & Action Items:**\n${keyPoints}\n\n**Status**: Structured & Ready for Review\n*Need to adjust tone or extract specific deadlines? Let me know!*`;
        }

        return "📋 **Task Summarization Tool**\n\nTo generate an instant executive summary, paste your notes, meeting minutes, or project task details. For example:\n\n> *\"Summarize: We met with the client to discuss the new dashboard rollout. The frontend blocks will be ready by Tuesday, API integration starts on Wednesday, and QA verification will happen on Friday before the Monday deployment.\"*\n\nI will organize the input into **Objectives**, **Key Deliverables**, and **Priority Action Items**!";
    }

    // 8. CONTACT & CONNECT
    if (lower.includes('contact') || lower.includes('reach out') || lower.includes('email') || lower.includes('phone') || lower.includes('hire') || lower.includes('talk to human')) {
        return "📞 **Connect with MyBlocks.in**\n\nWe would love to partner with you on your next digital initiative!\n\n- 🌐 **Website**: [MyBlocks.in](https://myblocks.in)\n- ✉️ **Inquiries**: contact@myblocks.in\n- 🤝 **Consultations**: Book an architecture review or exploratory project call directly through our team.\n\nFeel free to outline your project scope here, and I will help structure a concise brief you can send over!";
    }

    // 9. DEFAULT / FALLBACK INTELLIGENT RESPONSE
    return `Thank you for your message. I am the **MyBlocks AI Assistant**.\n\nWhile I continue to learn more about specific custom requests, I am primed to help you with:\n- 🏢 **Company Knowledge**: Learn about MyBlocks.in, our philosophy, and services.\n- 💡 **Project Ideation**: Generate creative software and business project concepts.\n- 📊 **Business Strategy**: Actionable guidance on scaling, workflows, and operations.\n- 🤝 **Customer Care**: Support frameworks, escalation templates, and communication best practices.\n- 📝 **Task Summarization**: Condense lengthy notes or tasks into clean action items.\n\nHow can I best support your work today?`;
}

/**
 * Main Agent Request Handler
 */
function handleAgentRequest(req, res) {
    try {
        const body = req.body || {};
        const message = body.message;

        // Input validation
        if (!message || typeof message !== 'string' || !message.trim()) {
            return res.status(400).json({
                success: false,
                error: "Invalid request: A non-empty 'message' string is required."
            });
        }

        // Generate response
        const responseText = processAgentMessage(message);

        return res.status(200).json({
            success: true,
            response: responseText
        });
    } catch (error) {
        return res.status(500).json({
            success: false,
            error: "An internal error occurred while processing the agent request."
        });
    }
}

// Router routes - supports explicit /api/agent and /api/v1/agent
router.post(['/api/v1/agent', '/api/agent'], handleAgentRequest);

// GET routes for health check / readiness verification
router.get(['/api/v1/agent', '/api/agent'], (req, res) => {
    res.status(200).json({
        success: true,
        service: "MyBlocks AI Assistant Backend",
        status: "operational"
    });
});

// Mount Universal Monitoring & Intelligence Platform routers
const experienceRouter = require('./src/api/experienceRoutes');
const systemRouter = require('./src/api/systemRoutes');
const adapterRouter = require('./src/api/adapterRoutes');
const healthRouter = require('./src/api/healthRoutes');
const qualityRouter = require('./src/api/qualityRoutes');
const usageRouter = require('./src/api/usageRoutes');
const intelligenceRouter = require('./src/api/intelligenceRoutes');
const alertingRouter = require('./src/api/alertingRoutes');
const reportingRouter = require('./src/api/reportingRoutes');
const orchestrationRouter = require('./src/api/orchestrationRoutes');
const onboardingRouter = require('./src/api/onboardingRoutes');
const agentRouter = require('./src/api/agentRoutes');
const remediationRouter = require('./src/api/remediationRoutes');
const runtimeRouter = require('./src/api/runtimeRoutes');
const eventRouter = require('./src/api/eventRoutes');

router.use(experienceRouter);
router.use(systemRouter);
router.use(adapterRouter);
router.use(healthRouter);
router.use(qualityRouter);
router.use(usageRouter);
router.use(intelligenceRouter);
router.use(alertingRouter);
router.use(reportingRouter);
router.use(orchestrationRouter);
router.use(onboardingRouter);
router.use(agentRouter);
router.use(remediationRouter);
router.use(runtimeRouter);
router.use(eventRouter);

module.exports = router;
