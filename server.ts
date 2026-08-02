import express from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // API endpoint to save the streaming configuration to the local files
  app.post("/api/save-config", (req, res) => {
    const { streamingUrl, actualizadoPor } = req.body;

    if (streamingUrl === undefined) {
      return res.status(400).json({ error: "El campo streamingUrl es requerido." });
    }

    const configData = {
      streamingUrl: streamingUrl,
      actualizado: new Date().toISOString(),
      actualizadoPor: actualizadoPor || "Administrador"
    };

    const configString = JSON.stringify(configData, null, 2);

    try {
      // 1. Guardar en el directorio public (para persistencia en desarrollo y en el repositorio de GitHub)
      const publicPath = path.join(process.cwd(), "public", "streaming_config.json");
      const publicDir = path.dirname(publicPath);
      if (!fs.existsSync(publicDir)) {
        fs.mkdirSync(publicDir, { recursive: true });
      }
      fs.writeFileSync(publicPath, configString, "utf8");

      // 2. Guardar también en el directorio dist si existe (para producción en tiempo real)
      const distPath = path.join(process.cwd(), "dist", "streaming_config.json");
      if (fs.existsSync(path.dirname(distPath))) {
        fs.writeFileSync(distPath, configString, "utf8");
      }

      console.log(`Configuración de streaming guardada con éxito por ${configData.actualizadoPor}:`, streamingUrl);
      return res.json({ success: true, data: configData });
    } catch (error: any) {
      console.error("Error al guardar la configuración:", error);
      return res.status(500).json({ error: "No se pudo escribir el archivo en el servidor: " + error.message });
    }
  });

  // Integración con Vite o Archivos Estáticos
  if (process.env.NODE_ENV !== "production") {
    // Configuración de Vite como Middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Servir archivos construidos estáticamente de la carpeta /dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[FULL-STACK SERVER] Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Error al iniciar el servidor Express + Vite:", err);
});
