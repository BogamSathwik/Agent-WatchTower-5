const { NineRulesMcpServer, TOOL_NAME, TOOL_DEFINITION } = require('./NineRulesMcpServer');

const defaultMcpServer = new NineRulesMcpServer();

function verifyAgentNineRules(parameters) {
    return defaultMcpServer.verifyAgentNineRules(parameters);
}

module.exports = {
    NineRulesMcpServer,
    defaultMcpServer,
    verifyAgentNineRules,
    TOOL_NAME,
    TOOL_DEFINITION
};

if (require.main === module) {
    defaultMcpServer.startStdioTransport();
}
