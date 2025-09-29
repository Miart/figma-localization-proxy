# Figma Localization Proxy

🌐 **Live Service**: https://miart.github.io/figma-localization-proxy/

A CORS proxy service for the Figma Localization Plugin to access Google Sheets data.

## 🎯 Purpose

This proxy solves the CORS (Cross-Origin Resource Sharing) problem when the Figma Localization Plugin tries to fetch data directly from Google Sheets. By running on a real domain (GitHub Pages), this proxy can make requests to Google Sheets and relay the data back to the plugin.

## 🚀 How It Works

1. **Figma Plugin** opens this proxy in a popup window
2. **User** enters their Google Sheets CSV URL
3. **Proxy** fetches the data (works because it runs on a real domain)
4. **Data** is sent back to the Figma plugin via `postMessage`

## 🔧 Usage

### For Plugin Users
1. Use the Figma Localization Plugin
2. When prompted, the proxy will open automatically
3. Paste your Google Sheets URL
4. Data will be loaded automatically

### For Developers
Include this proxy in your Figma plugin:

```javascript
// Open proxy in popup
const proxyUrl = 'https://miart.github.io/figma-localization-proxy/proxy.html';
const popup = window.open(proxyUrl, 'csv-proxy', 'width=600,height=500');

// Send URL to proxy
popup.postMessage({
  type: 'load-csv',
  url: 'your-google-sheets-url'
}, '*');

// Listen for response
window.addEventListener('message', function(event) {
  if (event.data.type === 'csv-success') {
    const csvData = event.data.data;
    // Process the CSV data
  }
});
```

### Manifest.json Setup
```json
{
  "networkAccess": {
    "allowedDomains": [
      "https://miart.github.io"
    ]
  }
}
```

## 📁 Files

- `index.html` - Information page about the proxy service
- `proxy.html` - The actual proxy interface that loads CSV data

## 🔒 Privacy & Security

- ✅ **No data storage**: All processing happens in your browser
- ✅ **No server logs**: GitHub Pages doesn't log request content
- ✅ **Open source**: All code is visible and auditable
- ✅ **HTTPS only**: Secure connection required
- ✅ **Origin validation**: Only accepts messages from allowed domains

## 🤝 Contributing

This proxy is part of the Figma Localization Plugin project. Feel free to:

- Report issues
- Suggest improvements
- Submit pull requests
- Fork for your own projects

## 📄 License

Open source - feel free to use and modify for your projects.

---

**Made with ❤️ for the Figma community**