/**
 * Centralized UI messages to ensure consistency across CLI and MCP interfaces.
 * This acts as the Single Source of Truth for user-facing strings.
 */

export const UIMessages = {
  /**
   * Usage hint for running a photon tool
   */
  photonUsage: (name: string) => `💡 Usage: ncp run ${name} <tool> [args]`,

  /**
   * Discovery hint for finding tools in a photon
   */
  photonDiscovery: (name: string) => `🔍 Discover tools: ncp find ${name}`,

  /**
   * Success message header for photon installation
   */
  photonInstalled: (name: string) => `✅ Photon "${name}" installed successfully!`,
  
  /**
   * Success message header for photon import from clipboard
   */
  photonImportedClipboard: (name: string) => `✅ Photon "${name}" imported from clipboard!`,

  /**
   * Success message header for photon import from file
   */
  photonImportedFile: (name: string) => `✅ Photon "${name}" imported successfully!`,

  /**
   * Success message header for photon download
   */
  photonDownloaded: (name: string) => `✅ Photon "${name}" downloaded successfully!`,
};
