/**
 * Smart Renderer Utility
 *
 * Re-exports from @portel/photon-core for backward compatibility.
 * All rendering logic lives in photon-core.
 */

export {
  shouldUseRichRendering,
  generateHTMLContent,
  createHTMLContentBlock,
  generateSmartRenderFragment,
  generateMCPSmartContent,
  analyzeFields,
  selectLayout,
  type LayoutType,
  type FieldMapping
} from '@portel/photon-core';
