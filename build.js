const esbuild = require('esbuild');
const fs = require('fs-extra');
const { execSync } = require('child_process');
const path = require('path');

const DIST_DIR = './dist';

// Get browser target from command line args (default: chrome)
const targetBrowser = process.argv[2] || 'chrome';
console.log(`🎯 Building for: ${targetBrowser.toUpperCase()}\n`);

// JS files to BUNDLE (these import from shared modules)
const bundledJsFiles = [
    'popup/popup.js',
    'options/options.js',
    'content/extractor.ts',
    'content/sidebar.ts',
    'content/chatbot_injector.ts'
];

// JS files to minify without bundling (standalone scripts)
const standaloneJsFiles = [
    'background.js'
];

// CSS files to minify
const cssFiles = [
    'popup/popup.css',
    'options/options.css',
    'content/sidebar.css',
    'content/chatbot_injector.css'
];

// HTML files to minify
const htmlFiles = [
    'popup/popup.html',
    'options/options.html'
];

async function build() {
    // Clean dist folder
    console.log('🧹 Cleaning dist folder...');
    fs.emptyDirSync(DIST_DIR);
    fs.mkdirSync(DIST_DIR, { recursive: true });

    // Create subdirectories
    fs.mkdirSync(path.join(DIST_DIR, 'popup'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'options'), { recursive: true });
    fs.mkdirSync(path.join(DIST_DIR, 'content'), { recursive: true });

    // Bundle and minify JS files that import from shared modules
    console.log('📦 Bundling & Minifying JavaScript...');
    for (const file of bundledJsFiles) {
        if (fs.existsSync(file)) {
            await esbuild.build({
                entryPoints: [file],
                outfile: path.join(DIST_DIR, file.replace(/\.ts$/, '.js')),
                bundle: true,  // Bundle imports together
                minify: true,
                minifyWhitespace: true,
                minifyIdentifiers: true,
                minifySyntax: true,
                target: ['chrome100', 'firefox100'],
                format: 'iife',  // IIFE for browser scripts
            });
            console.log(`   ✓ ${file} (bundled)`);
        } else {
            console.log(`   ⚠ ${file} not found, skipping...`);
        }
    }

    // Minify standalone JS files (no bundling needed)
    for (const file of standaloneJsFiles) {
        if (fs.existsSync(file)) {
            await esbuild.build({
                entryPoints: [file],
                outfile: path.join(DIST_DIR, file),
                bundle: false,
                minify: true,
                minifyWhitespace: true,
                minifyIdentifiers: true,
                minifySyntax: true,
                target: ['chrome100', 'firefox100'],
                format: 'iife',
            });
            console.log(`   ✓ ${file}`);
        } else {
            console.log(`   ⚠ ${file} not found, skipping...`);
        }
    }

    // Minify CSS files
    console.log('🎨 Minifying CSS...');
    for (const file of cssFiles) {
        if (fs.existsSync(file)) {
            execSync(`npx clean-css-cli -o ${path.join(DIST_DIR, file)} ${file}`);
            console.log(`   ✓ ${file}`);
        } else {
            console.log(`   ⚠ ${file} not found, skipping...`);
        }
    }

    // Minify HTML and remove shared script tags (they're now bundled)
    console.log('📄 Minifying HTML...');
    for (const file of htmlFiles) {
        if (fs.existsSync(file)) {
            // Read HTML, remove shared script references, then minify
            let html = fs.readFileSync(file, 'utf-8');

            // Remove references to shared scripts (now bundled into main script)
            html = html.replace(/<script\s+src=["']\.\.\/shared\/[^"']+["']\s*><\/script>\s*/gi, '');

            // Write temp file
            const tempFile = file + '.tmp';
            fs.writeFileSync(tempFile, html);

            // Minify
            execSync(`npx html-minifier-terser --collapse-whitespace --remove-comments --minify-css true --minify-js true -o ${path.join(DIST_DIR, file)} ${tempFile}`);

            // Remove temp file
            fs.removeSync(tempFile);

            console.log(`   ✓ ${file}`);
        } else {
            console.log(`   ⚠ ${file} not found, skipping...`);
        }
    }

    // Copy the correct manifest based on target browser
    console.log('📋 Copying manifest.json...');
    const manifestSource = targetBrowser === 'firefox' ? 'manifest.firefox.json' : 'manifest.chrome.json';

    if (fs.existsSync(manifestSource)) {
        fs.copySync(manifestSource, path.join(DIST_DIR, 'manifest.json'));
        console.log(`   ✓ ${manifestSource} → manifest.json`);
    } else {
        // Fallback to default manifest.json
        fs.copySync('manifest.json', path.join(DIST_DIR, 'manifest.json'));
        console.log('   ✓ manifest.json (default)');
    }

    // Copy icons
    console.log('🖼️  Copying icons...');
    fs.copySync('icons', path.join(DIST_DIR, 'icons'));
    console.log('   ✓ icons/');

    // Build summary
    console.log('\n✅ Build complete!');
    console.log(`🎯 Target: ${targetBrowser.toUpperCase()}`);
    console.log(`📁 Output: ${path.resolve(DIST_DIR)}`);

    // Show folder size
    const totalSize = getTotalSize(DIST_DIR);
    console.log(`📊 Total size: ${formatBytes(totalSize)}`);

    // Show size comparison
    const originalSize = getTotalSize('.', [DIST_DIR, 'node_modules', '.git']);
    const savings = originalSize - totalSize;
    const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
    console.log(`💾 Size reduction: ${formatBytes(savings)} (${savingsPercent}% smaller)`);
}

// Helper: Calculate folder size (with exclusions)
function getTotalSize(dir, exclude = []) {
    let size = 0;

    try {
        const files = fs.readdirSync(dir);

        for (const file of files) {
            if (exclude.includes(file)) continue;

            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat.isDirectory()) {
                size += getTotalSize(filePath, exclude);
            } else {
                // Only count relevant files for source
                const ext = path.extname(file).toLowerCase();
                if (['.js', '.css', '.html', '.json', '.png', '.svg', '.md'].includes(ext)) {
                    size += stat.size;
                }
            }
        }
    } catch (e) {
        // Ignore errors
    }

    return size;
}

// Helper: Format bytes to readable string
function formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

build().catch((err) => {
    console.error('❌ Build failed:', err);
    process.exit(1);
});