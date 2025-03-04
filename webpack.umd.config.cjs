const webpack = require("webpack");
const path = require("path");

module.exports = {
  mode: "production",
  entry: {
    "js-waku": "./src/index.ts",
  },
  devtool: "inline-source-map",
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.ProvidePlugin({
      process: "process/browser.js",
      Buffer: ["buffer", "Buffer"],
    }),
  ],
  resolve: {
    extensions: [".ts", ".js"],
    fallback: {
      buffer: require.resolve("buffer/"),
      crypto: false,
      stream: require.resolve("stream-browserify"),
    },
  },
  output: {
    filename: "index.js",
    path: path.resolve(__dirname, "dist/umd"),
    library: "waku",
    libraryTarget: "umd",
    globalObject: "this",
  },
};
