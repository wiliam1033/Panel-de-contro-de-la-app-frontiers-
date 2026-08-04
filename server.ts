import express from "express";
import fs from "fs";
import path from "path";
import http from "http";
import https from "https";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Middleware to parse JSON bodies
  app.use(express.json());

  // Serve firebase-applet-config.json from the root
  app.get("/firebase-applet-config.json", (req, res) => {
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      res.sendFile(configPath);
    } else {
      res.status(404).json({ error: "Firebase config not found" });
    }
  });

  // API endpoint to proxy HTTP streams safely over HTTPS
  app.get("/api/proxy-stream", (req, res) => {
    const streamUrl = req.query.url as string;
    if (!streamUrl) {
      return res.status(400).send("Falta el parámetro 'url' del streaming.");
    }

    try {
      const parsedUrl = new URL(streamUrl);
      const client = parsedUrl.protocol === "https:" ? https : http;

      // Configure headers for audio streaming
      res.setHeader("Content-Type", "audio/mpeg");
      res.setHeader("Transfer-Encoding", "chunked");
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");

      const proxyReq = client.get(streamUrl, (proxyRes) => {
        if (proxyRes.headers["content-type"]) {
          res.setHeader("Content-Type", proxyRes.headers["content-type"]);
        }
        proxyRes.pipe(res);
      });

      proxyReq.on("error", (err) => {
        console.error("Error en la conexión del streaming proxy:", err);
        if (!res.headersSent) {
          res.status(502).send("No se pudo conectar al servidor de streaming de radio.");
        }
      });

      // Close backend connection if client disconnects
      req.on("close", () => {
        proxyReq.destroy();
      });
    } catch (error: any) {
      console.error("Error al procesar la URL de proxy:", error);
      res.status(400).send("URL inválida: " + error.message);
    }
  });

  // API endpoint to save the streaming configuration to the local files
  app.post("/api/save-config", (req, res) => {
    let { streamingUrl, isBase64, actualizadoPor } = req.body;

    if (streamingUrl === undefined) {
      return res.status(400).json({ error: "El campo streamingUrl es requerido." });
    }

    if (isBase64) {
      try {
        streamingUrl = Buffer.from(streamingUrl, 'base64').toString('utf8');
      } catch (e) {
        return res.status(400).json({ error: "URL encoding inválido." });
      }
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
