import { spawn } from "child_process";
import path from "path";

export function startChroma() {
  const chromaPath = path.resolve("./chroma_db");

  // Comando para levantar Chroma con persistencia local
  const chromaProcess = spawn("chroma", ["run", "--path", chromaPath], {
    stdio: "inherit", // para ver logs en consola
    shell: true
  });

  chromaProcess.on("close", (code) => {
    console.log(`Chroma se cerró con código ${code}`);
  });

  process.on("exit", () => chromaProcess.kill());
}
