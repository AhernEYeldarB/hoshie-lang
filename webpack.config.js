const path = require("path");

module.exports = {
  entry: "./src/hlcc/codeGen/genBodyless.ts",
  devtool: "inline-source-map",
  mode: "development",
  module: {
    rules: [
      {
        use: "ts-loader",
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: [".tsx", ".ts", ".js"],
  },
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "./docs/@hoshie-lang"),
  },
  externals: {
    fs: "commonjs fs",
    path: "commonjs path",
  },
};  