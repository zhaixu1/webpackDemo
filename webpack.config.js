const path = require('path');
const { WebpackRunPlugin, WebpackDonePlugin, loader1, loader2 } = require("./webpack")

module.exports = {
    mode: 'development',
    entry: './src/index.js',
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: '[name].js'
    },
    devtool: 'source-map',
    plugins: [new WebpackRunPlugin(), new WebpackDonePlugin()],
    module: {
      rules: [
        {
          test: /\.js$/,
          use: [loader1, loader2],
        },
      ],
    },
}