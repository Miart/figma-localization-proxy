// Import TypeScript modules (will be compiled to JS)
// import { loadCsvFromUrl, parseCsv, LocalizationData } from './parser';
// import { autoFitTextToContainer, AutosizeOptions } from './autosize';

// Since we can't use ES6 imports directly in Figma plugins, we'll include the functionality inline

// Localization data storage
let localizationData = null;
let availableLanguages = [];

// Plugin state
let isLoading = false;

// Show the UI
figma.showUI(__html__, { width: 400, height: 600 });

// Message handling
figma.ui.onmessage = async (msg) => {
  try {
    console.log('Plugin received message:', msg.type);

    switch (msg.type) {
      case 'load-csv':
        await handleLoadCsv(msg.url);
        break;

      case 'load-sheets-api':
        await handleLoadSheetsApi(msg.sheetId, msg.apiKey);
        break;

      case 'load-csv-direct':
        await handleLoadCsvDirect(msg.csvContent);
        break;

      case 'sheetsData':
        // Handle data from iframe proxy
        await handleLoadCsvDirect(msg.data);
        break;

      case 'localize-all':
        await handleLocalizeAll(msg.options);
        break;

      case 'localize-selected':
        await handleLocalizeSelected(msg.options);
        break;

      case 'generate-all-languages':
        await handleGenerateAllLanguages();
        break;

      case 'cancel':
        figma.closePlugin();
        break;

      default:
        console.log('Unknown message type:', msg.type);
    }
  } catch (error) {
    console.error('Plugin error:', error);
    figma.ui.postMessage({
      type: 'error',
      message: error.message
    });
  }
};

async function handleLoadCsv(url) {
  if (isLoading) return;

  isLoading = true;
  figma.ui.postMessage({ type: 'loading', isLoading: true });

  try {
    // Convert Google Sheets URL to CSV export format
    const csvUrl = convertToGoogleSheetsCsvUrl(url);

    // Load CSV content
    const csvContent = await fetchCsvContent(csvUrl);

    // Parse CSV
    const parseResult = parseCsv(csvContent);

    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    // Store data
    localizationData = parseResult.data;
    availableLanguages = parseResult.languages;

    // Send success response
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: true,
      languages: availableLanguages,
      keyCount: Object.keys(localizationData).length
    });

  } catch (error) {
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: false,
      error: error.message
    });
  } finally {
    isLoading = false;
    figma.ui.postMessage({ type: 'loading', isLoading: false });
  }
}

async function handleLoadSheetsApi(sheetId, apiKey) {
  if (isLoading) return;

  isLoading = true;
  figma.ui.postMessage({ type: 'loading', isLoading: true });

  try {
    // Use Google Sheets API
    const range = 'A1:Z1000'; // Large enough range to cover most sheets
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}?key=${apiKey}`;

    console.log('Loading from Google Sheets API:', url);

    const response = await fetch(url);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Google Sheets API error ${response.status}: ${errorData.error && errorData.error.message || response.statusText}`);
    }

    const data = await response.json();
    console.log('Google Sheets API response:', data);

    if (!data.values || data.values.length < 2) {
      throw new Error('Sheet appears to be empty or has insufficient data');
    }

    // Convert Google Sheets format to CSV
    const csvContent = data.values.map(row =>
      row.map(cell => {
        // Escape cells that contain commas or quotes
        if (cell.includes(',') || cell.includes('"') || cell.includes('\n')) {
          return `"${cell.replace(/"/g, '""')}"`;
        }
        return cell;
      }).join(',')
    ).join('\n');

    console.log('Converted to CSV:', csvContent.substring(0, 200));

    // Parse CSV
    const parseResult = parseCsv(csvContent);

    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    // Store data
    localizationData = parseResult.data;
    availableLanguages = parseResult.languages;

    // Send success response
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: true,
      languages: availableLanguages,
      keyCount: Object.keys(localizationData).length
    });

  } catch (error) {
    console.error('Google Sheets API error:', error);
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: false,
      error: error.message
    });
  } finally {
    isLoading = false;
    figma.ui.postMessage({ type: 'loading', isLoading: false });
  }
}

async function handleLoadCsvDirect(csvContent) {
  if (isLoading) return;

  isLoading = true;
  figma.ui.postMessage({ type: 'loading', isLoading: true });

  try {
    // Parse CSV directly
    const parseResult = parseCsv(csvContent);

    if (!parseResult.success) {
      throw new Error(parseResult.error);
    }

    // Store data
    localizationData = parseResult.data;
    availableLanguages = parseResult.languages;

    // Send success response
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: true,
      languages: availableLanguages,
      keyCount: Object.keys(localizationData).length
    });

  } catch (error) {
    figma.ui.postMessage({
      type: 'csv-loaded',
      success: false,
      error: error.message
    });
  } finally {
    isLoading = false;
    figma.ui.postMessage({ type: 'loading', isLoading: false });
  }
}

async function handleLocalizeAll(options) {
  if (!localizationData) {
    throw new Error('No localization data loaded');
  }

  const sections = findLanguageSections(figma.currentPage);

  if (sections.length === 0) {
    figma.ui.postMessage({
      type: 'localization-complete',
      results: {},
      message: 'No language sections found on the page'
    });
    return;
  }

  const results = {};

  for (const section of sections) {
    const result = await localizeSection(section, options);
    results[section.language] = result;
  }

  figma.ui.postMessage({
    type: 'localization-complete',
    results,
    message: 'Localization completed for all sections'
  });
}

async function handleLocalizeSelected(options) {
  if (!localizationData) {
    throw new Error('No localization data loaded');
  }

  const selection = figma.currentPage.selection;

  if (selection.length === 0) {
    figma.ui.postMessage({
      type: 'localization-complete',
      results: {},
      message: 'No sections selected'
    });
    return;
  }

  const sections = [];

  for (const node of selection) {
    const language = detectLanguageFromName(node.name);
    if (language && availableLanguages.includes(language.toUpperCase())) {
      sections.push({
        node,
        language: language.toUpperCase(),
        name: node.name
      });
    }
  }

  if (sections.length === 0) {
    figma.ui.postMessage({
      type: 'localization-complete',
      results: {},
      message: 'No valid language sections found in selection'
    });
    return;
  }

  const results = {};

  for (const section of sections) {
    const result = await localizeSection(section, options);
    results[section.language] = result;
  }

  figma.ui.postMessage({
    type: 'localization-complete',
    results,
    message: 'Localization completed for selected sections'
  });
}

async function handleGenerateAllLanguages() {
  if (!localizationData) {
    throw new Error('No localization data loaded. Please load CSV first.');
  }

  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    figma.ui.postMessage({
      type: 'generation-complete',
      success: false,
      error: 'Please select exactly one section to use as master template'
    });
    return;
  }

  const masterSection = selection[0];

  // Detect master section language
  const masterLanguage = detectLanguageFromName(masterSection.name);
  if (!masterLanguage || !availableLanguages.includes(masterLanguage.toUpperCase())) {
    figma.ui.postMessage({
      type: 'generation-complete',
      success: false,
      error: `Selected section "${masterSection.name}" doesn't match any language in CSV data. Available languages: ${availableLanguages.join(', ')}`
    });
    return;
  }

  const masterLangCode = masterLanguage.toUpperCase();

  // Find languages that need generation (exclude master language)
  const languagesToGenerate = availableLanguages.filter(lang => lang !== masterLangCode);

  if (languagesToGenerate.length === 0) {
    figma.ui.postMessage({
      type: 'generation-complete',
      success: false,
      error: 'No additional languages to generate'
    });
    return;
  }

  const generatedSections = [];
  let sectionsCreated = 0;

  try {
    // Calculate positioning
    const masterBounds = {
      x: masterSection.x,
      y: masterSection.y,
      width: masterSection.width,
      height: masterSection.height
    };

    const spacing = 50; // Space between sections
    let currentX = masterBounds.x + masterBounds.width + spacing;
    let currentY = masterBounds.y;
    const maxWidth = figma.viewport.bounds.width - 200; // Leave some margin

    for (const language of languagesToGenerate) {
      // Clone the master section
      const clonedSection = masterSection.clone();

      // Position the cloned section
      clonedSection.x = currentX;
      clonedSection.y = currentY;

      // Rename the section to the target language
      clonedSection.name = language;

      // Add to the same parent as master section
      if (masterSection.parent && masterSection.parent.type !== 'PAGE') {
        masterSection.parent.appendChild(clonedSection);
      } else {
        figma.currentPage.appendChild(clonedSection);
      }

      // Localize the cloned section immediately
      const localizationResult = await localizeSection({
        node: clonedSection,
        language: language,
        name: clonedSection.name
      }, { autosizeEnabled: false, minFontSize: 10 });

      generatedSections.push({
        language,
        section: clonedSection,
        localized: localizationResult.localized,
        warnings: localizationResult.warnings
      });

      sectionsCreated++;

      // Calculate next position
      currentX += clonedSection.width + spacing;

      // Wrap to next row if needed
      if (currentX > maxWidth) {
        currentX = masterBounds.x;
        currentY += masterBounds.height + spacing;
      }
    }

    // Select all generated sections
    figma.currentPage.selection = generatedSections.map(gs => gs.section);

    // Zoom to fit all sections
    if (generatedSections.length > 0) {
      const allSections = [masterSection, ...generatedSections.map(gs => gs.section)];
      figma.viewport.scrollAndZoomIntoView(allSections);
    }

    figma.ui.postMessage({
      type: 'generation-complete',
      success: true,
      message: 'Language sections generated and localized successfully',
      generatedLanguages: languagesToGenerate,
      sectionsCreated: sectionsCreated,
      masterLanguage: masterLangCode,
      results: generatedSections.reduce((acc, gs) => {
        acc[gs.language] = {
          localized: gs.localized,
          warnings: gs.warnings
        };
        return acc;
      }, {})
    });

  } catch (error) {
    figma.ui.postMessage({
      type: 'generation-complete',
      success: false,
      error: error.message
    });
  }
}

function findLanguageSections(page) {
  const sections = [];

  function traverse(node) {
    const language = detectLanguageFromName(node.name);

    if (language && availableLanguages.includes(language.toUpperCase())) {
      sections.push({
        node,
        language: language.toUpperCase(),
        name: node.name
      });
    } else if ('children' in node) {
      node.children.forEach(traverse);
    }
  }

  page.children.forEach(traverse);
  return sections;
}

function detectLanguageFromName(name) {
  // Extract language code from section name (case insensitive)
  const cleanName = name.trim().toUpperCase();

  // Check if the entire name is a language code
  if (availableLanguages.includes(cleanName)) {
    return cleanName;
  }

  // Check if name contains language code
  for (const lang of availableLanguages) {
    if (cleanName.includes(lang)) {
      return lang;
    }
  }

  return null;
}

async function localizeSection(section, options) {
  const textNodes = findTextNodes(section.node);
  let localizedCount = 0;
  let autosizedCount = 0;
  const warnings = [];

  for (const textNode of textNodes) {
    try {
      const key = textNode.name.trim();
      const translation = localizationData[key] && localizationData[key][section.language];

      if (!translation) {
        warnings.push(`Key '${key}' not found for language '${section.language}'`);
        continue;
      }

      if (!translation.trim()) {
        warnings.push(`Empty translation for key '${key}' in language '${section.language}'`);
        continue;
      }

      // Load font and set text
      await figma.loadFontAsync(textNode.fontName);
      textNode.characters = translation;
      localizedCount++;

      // Apply autosize if enabled
      if (options.autosizeEnabled) {
        const autosizeResult = await autoFitTextToContainer(textNode, {
          enabled: true,
          minFontSize: options.minFontSize || 10
        });

        if (autosizeResult.applied) {
          autosizedCount++;
        }
      }

    } catch (error) {
      warnings.push(`Error localizing '${textNode.name}': ${error.message}`);
    }
  }

  return {
    localized: localizedCount,
    autosized: autosizedCount,
    warnings,
    totalTextNodes: textNodes.length
  };
}

function findTextNodes(node) {
  const textNodes = [];

  function traverse(n) {
    if (n.type === 'TEXT') {
      textNodes.push(n);
    } else if ('children' in n) {
      n.children.forEach(traverse);
    }
  }

  traverse(node);
  return textNodes;
}

// Utility functions (inline implementations of parser.ts and autosize.ts functionality)

function convertToGoogleSheetsCsvUrl(url) {
  if (url.includes('/edit')) {
    const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
    }
  }

  if (url.includes('export?format=csv')) {
    return url;
  }

  return url;
}

async function fetchCsvContent(url) {
  try {
    console.log('Attempting to fetch:', url);

    const response = await fetch(url);
    console.log('Fetch response:', response.status, response.statusText);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();
    console.log('CSV loaded successfully, length:', text.length);
    console.log('First 100 chars:', text.substring(0, 100));

    return text;
  } catch (error) {
    console.error('Detailed fetch error:', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });

    // Попробуем альтернативный способ
    if (url.includes('docs.google.com')) {
      console.log('Trying alternative approach...');
      figma.ui.postMessage({
        type: 'csv-loaded',
        success: false,
        error: `Network access blocked. Please try: 1) Use 'Publish to web' method 2) Check if URL is public 3) Try a different CSV hosting service. URL: ${url}`
      });
      return;
    }

    throw new Error(`Network request failed: ${error.message}`);
  }
}

function parseCsv(csvContent) {
  try {
    const lines = csvContent.trim().split('\n');

    if (lines.length < 2) {
      return {
        success: false,
        error: "CSV must have at least 2 rows (header + data)"
      };
    }

    const headers = parseCSVLine(lines[0]);

    if (headers.length < 2) {
      return {
        success: false,
        error: "CSV must have at least 2 columns (key + languages)"
      };
    }

    const keyColumn = headers[0].toLowerCase();
    if (!['key', 'keys', 'id'].includes(keyColumn)) {
      return {
        success: false,
        error: "First column must be 'key', 'keys', or 'id'"
      };
    }

    const languages = headers.slice(1).map(lang => lang.trim().toUpperCase());

    if (languages.length === 0) {
      return {
        success: false,
        error: "No language columns found"
      };
    }

    const data = {};

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);

      if (values.length < 2) continue;

      const key = values[0].trim();
      if (!key) continue;

      data[key] = {};

      for (let j = 1; j < Math.min(values.length, headers.length); j++) {
        const language = languages[j - 1];
        const translation = values[j] ? values[j].trim() : '';
        data[key][language] = translation;
      }
    }

    return {
      success: true,
      data,
      languages
    };

  } catch (error) {
    return {
      success: false,
      error: `Failed to parse CSV: ${error.message}`
    };
  }
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current);
  return result;
}

async function autoFitTextToContainer(textNode, options) {
  if (!options.enabled) {
    return { applied: false };
  }

  try {
    const parent = textNode.parent;
    if (!parent || !('width' in parent) || !('height' in parent)) {
      return { applied: false, error: "No fixed container found" };
    }

    if (textNode.textAutoResize !== "NONE") {
      textNode.textAutoResize = "NONE";
    }

    const originalFontSize = typeof textNode.fontSize === 'number' ? textNode.fontSize : 16;
    const originalLineHeight = textNode.lineHeight;
    const originalLetterSpacing = textNode.letterSpacing;

    const maxWidth = parent.width;
    const maxHeight = parent.height;

    let currentFontSize = originalFontSize;
    const stepSize = 0.5;
    const maxIterations = 50;

    await figma.loadFontAsync(textNode.fontName);

    for (let i = 0; i < maxIterations; i++) {
      if (textNode.width <= maxWidth && textNode.height <= maxHeight) {
        return {
          applied: i > 0,
          originalFontSize,
          newFontSize: currentFontSize
        };
      }

      currentFontSize -= stepSize;

      if (currentFontSize < options.minFontSize) {
        figma.notify(`⚠ Text "${textNode.name}" cannot fit container with minimum font size ${options.minFontSize}px`);
        return {
          applied: false,
          originalFontSize,
          newFontSize: currentFontSize,
          error: "Cannot fit with minimum font size"
        };
      }

      textNode.fontSize = currentFontSize;

      if (originalLineHeight && typeof originalLineHeight === 'object' && originalLineHeight.unit === 'PIXELS') {
        const ratio = currentFontSize / originalFontSize;
        textNode.lineHeight = {
          value: originalLineHeight.value * ratio,
          unit: 'PIXELS'
        };
      }

      if (originalLetterSpacing && typeof originalLetterSpacing === 'object' && originalLetterSpacing.unit === 'PIXELS') {
        const ratio = currentFontSize / originalFontSize;
        textNode.letterSpacing = {
          value: originalLetterSpacing.value * ratio,
          unit: 'PIXELS'
        };
      }

      await new Promise(resolve => setTimeout(resolve, 10));
    }

    return {
      applied: false,
      originalFontSize,
      newFontSize: currentFontSize,
      error: "Max iterations reached"
    };

  } catch (error) {
    return {
      applied: false,
      error: `Autosize failed: ${error.message}`
    };
  }
}