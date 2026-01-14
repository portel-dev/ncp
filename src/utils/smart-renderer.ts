/**
 * Smart Renderer Utility
 *
 * Generates HTML content for MCP responses using photon-core's smart rendering.
 * This enables rich, iOS-inspired UI components in MCP clients that support HTML.
 */

import {
  generateSmartRenderingJS,
  generateSmartRenderingCSS,
  analyzeFields,
  selectLayout,
  type LayoutType,
  type FieldMapping
} from '@portel/photon-core';

/**
 * Generate an HTML content block for MCP tool responses
 *
 * @param data - The data to render (object, array, or primitive)
 * @param options - Rendering options
 * @returns HTML string with embedded CSS/JS for rich rendering
 */
export function generateHTMLContent(
  data: any,
  options: {
    title?: string;
    format?: LayoutType;
    standalone?: boolean;  // Include full HTML document wrapper
  } = {}
): string {
  const { title, format, standalone = false } = options;

  // Analyze fields if data is object/array
  let fieldMapping: FieldMapping | undefined;
  if (data && typeof data === 'object') {
    fieldMapping = analyzeFields(data);
  }

  // Auto-select layout if not specified
  const layout = format || selectLayout(data);

  // Generate inline script for rendering
  const renderScript = `
    <script>
      ${generateSmartRenderingJS()}

      // Render data with smart rendering
      document.addEventListener('DOMContentLoaded', function() {
        const container = document.getElementById('smart-render-container');
        const data = ${JSON.stringify(data)};
        const layout = '${layout}';
        const fieldMapping = ${JSON.stringify(fieldMapping || {})};

        // Use template engine to render
        if (window.TemplateEngine && window.TemplateEngine.render) {
          container.innerHTML = window.TemplateEngine.render(data, {
            layout,
            fieldMapping,
            title: ${JSON.stringify(title || '')}
          });
        } else {
          // Fallback to JSON display
          container.innerHTML = '<pre>' + JSON.stringify(data, null, 2) + '</pre>';
        }
      });
    </script>
  `;

  const styles = `
    <style>
      ${generateSmartRenderingCSS()}
    </style>
  `;

  const content = `
    ${styles}
    <div id="smart-render-container" class="smart-render">
      ${title ? `<h2 class="smart-render-title">${title}</h2>` : ''}
      <div class="loading">Loading...</div>
    </div>
    ${renderScript}
  `;

  if (standalone) {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title || 'NCP Result'}</title>
</head>
<body>
  ${content}
</body>
</html>`;
  }

  return content;
}

/**
 * Create an MCP content block with HTML type
 *
 * @param data - Data to render
 * @param options - Rendering options
 * @returns MCP content block object
 */
export function createHTMLContentBlock(
  data: any,
  options: {
    title?: string;
    format?: LayoutType;
  } = {}
): { type: 'text'; text: string; mimeType?: string } {
  return {
    type: 'text',
    text: generateHTMLContent(data, { ...options, standalone: false }),
    mimeType: 'text/html'
  };
}

/**
 * Check if data would benefit from rich HTML rendering
 * (arrays of objects, nested structures, etc.)
 */
export function shouldUseRichRendering(data: any): boolean {
  if (!data) return false;

  // Arrays of objects benefit from list/grid rendering
  if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
    return true;
  }

  // Nested objects benefit from tree/card rendering
  if (typeof data === 'object' && !Array.isArray(data)) {
    const values = Object.values(data);
    if (values.some(v => typeof v === 'object' && v !== null)) {
      return true;
    }
  }

  return false;
}

// Re-export useful types and functions from photon-core
export { analyzeFields, selectLayout, type LayoutType, type FieldMapping } from '@portel/photon-core';
