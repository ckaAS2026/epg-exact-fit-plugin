export function createMcpService() {
  return {
    isReady() {
      return false;
    },

    prepareAction(actionName) {
      return {
        actionName,
        ready: false,
        message: "MCP-Integration ist vorbereitet, aber noch nicht verbunden."
      };
    }
  };
}
