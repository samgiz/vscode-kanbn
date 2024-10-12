import * as esbuild from "esbuild"
import * as path from "path"

const isProd = process.env.NODE_ENV === "production"

const buildOptions: esbuild.BuildOptions = {
  entryPoints: [path.resolve(__dirname, "src", "extension.ts")],
  bundle: true,
  outfile: path.resolve(__dirname, "out", "extension.js"),
  platform: "node",
  target: "node16",
  external: ["vscode"],
  sourcemap: !isProd,
  minify: isProd,
  plugins: [
    {
      name: "build",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors && result.errors.length > 0) {
            console.error("Build failed")
            printErrors(result.errors)
          } else {
            console.log("Build succeeded")
          }
        })
        build.onStart(() => {
          console.log("Starting a build")
        })
      },
    },
  ],
}

async function build() {
  try {
    await esbuild.build(buildOptions)
  } catch (error) {
    console.error("Build failed:", error)
    process.exit(1)
  }
}

function printErrors(errors: esbuild.Message[]) {
  for (const err of errors) {
    const location = err.location
    if (location) {
      console.error(`${location.file}:${location.line}:${location.column}: error: ${err.text}`)
    } else {
      console.error(`error: ${err.text}`)
    }
  }
}

build()
