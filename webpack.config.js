const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
  const isProduction = argv.mode === 'production';
  const browser = env.browser || 'chrome'; // Default to chrome

  return {
    mode: isProduction ? 'production' : 'development',
    devtool: isProduction ? false : 'cheap-module-source-map',
    
    entry: {
      background: './src/background.js',
      'task-creation-modal': './src/task-creation-modal.js',
      'popup/popup': './popup/popup.js',
      'content-scripts/gmail': './content-scripts/gmail.js',
      'content-scripts/outlook': './content-scripts/outlook.js',
      'content-scripts/github': './content-scripts/github.js'
    },
    
    output: {
      path: path.resolve(__dirname, `dist/${browser}`),
      filename: '[name].js',
      clean: true
    },
    
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'webextension-polyfill': path.resolve(__dirname, 'node_modules/webextension-polyfill/dist/browser-polyfill.min.js')
      }
    },
    
    module: {
      rules: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          use: {
            loader: 'babel-loader',
            options: {
              presets: ['@babel/preset-env']
            }
          }
        }
      ]
    },
    
    plugins: [
      new CopyWebpackPlugin({
        patterns: [
          // Copy manifest based on browser
          {
            from: `src/manifest.${browser}.json`,
            to: 'manifest.json'
          },
          // Copy static assets
          {
            from: 'popup/popup.html',
            to: 'popup/popup.html'
          },
          {
            from: 'popup/popup.css',
            to: 'popup/popup.css'
          },
          {
            from: 'styles',
            to: 'styles'
          },
          {
            from: 'icons',
            to: 'icons'
          },
          {
            from: 'README.md',
            to: 'README.md'
          },
          {
            from: 'INSTALL.md',
            to: 'INSTALL.md'
          },
          {
            from: 'QUICK_INSTALL.md',
            to: 'QUICK_INSTALL.md'
          },
          // Copy browser polyfill
          {
            from: 'node_modules/webextension-polyfill/dist/browser-polyfill.min.js',
            to: 'lib/browser-polyfill.min.js'
          }
        ]
      })
    ],
    
    optimization: {
      minimize: isProduction
    }
  };
};