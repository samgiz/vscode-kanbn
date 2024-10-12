import * as esbuild from "esbuild"
import * as path from "path"

const isProd = process.env.NODE_ENV === "production"

const buildOptions: esbuild.BuildOptions = {
  entryPoints: [path.resolve(__dirname, "src", "index.tsx")],
  bundle: true,
  outfile: path.resolve(__dirname, "out", "index.js"),
  platform: "browser",
  target: ["chrome89", "edge89", "firefox86", "safari14"],
  sourcemap: !isProd,
  minify: isProd,
  define: {
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "development"),
  },
  loader: {
    ".png": "file",
    ".svg": "file",
    ".css": "css",
    ".woff": "file",
    ".woff2": "file",
    ".ttf": "file",
  },
  plugins: [
    {
      name: "build",
      setup(build) {
        build.onStart(() => {
          console.log("Starting a build")
        })
        build.onEnd((result) => {
          if (result.errors && result.errors.length > 0) {
            console.error("Build failed")
            printErrors(result.errors)
          } else {
            console.log("Build succeeded")
          }
        })
      },
    },
  ],
  jsx: "automatic",
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
