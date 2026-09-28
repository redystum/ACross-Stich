import { projectRepository } from "./db";
import { getSampleHeart, getSamplePotion, getSampleCat } from "./samples";
import { networkInterfaces } from "node:os";
import { join } from "path";
import { existsSync, statSync } from "fs";

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = join(import.meta.dir, "public");

// Seed default samples if no projects exist
function seedIfEmpty() {
  if (projectRepository.count() === 0) {
    console.log("Database empty. Seeding initial pixel art projects...");
    const heart = getSampleHeart();
    projectRepository.create({
      name: heart.name,
      width: heart.width,
      height: heart.height,
      originalImage: heart.originalImage,
      changedColors: {
        "#e11d48": "#10b981", // Replaced red with emerald to show color replacement in action!
      },
      completedPixels: heart.completedPixels,
      completeStyle: {
        color: "#6366f1",
        opacity: 0.75,
        mode: "cross",
        hideCompleted: false,
      },
    });

    const potion = getSamplePotion();
    projectRepository.create({
      name: potion.name,
      width: potion.width,
      height: potion.height,
      originalImage: potion.originalImage,
      changedColors: {},
      completedPixels: potion.completedPixels,
      completeStyle: {
        color: "#22c55e",
        opacity: 0.7,
        mode: "tint",
        hideCompleted: false,
      },
    });

    const cat = getSampleCat();
    projectRepository.create({
      name: cat.name,
      width: cat.width,
      height: cat.height,
      originalImage: cat.originalImage,
      changedColors: {
        "#f97316": "#8b5cf6", // Purple cat replacement!
      },
      completedPixels: cat.completedPixels,
      completeStyle: {
        color: "#ec4899",
        opacity: 0.8,
        mode: "tint",
        hideCompleted: false,
      },
    });
    console.log("Seeded 3 starter projects successfully.");
  }
}

seedIfEmpty();

// Helper to get local network IPv4 addresses
function getLocalIps(): string[] {
  const ips: string[] = [];
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) {
        ips.push(net.address);
      }
    }
  }
  return ips;
}

// MIME types for static files
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

// Response helpers with CORS
function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

// Start Bun HTTP Server
const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const method = req.method;

    // Handle CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }

    // ==========================================
    // API ROUTES
    // ==========================================

    // GET /api/network-info
    if (url.pathname === "/api/network-info" && method === "GET") {
      const ips = getLocalIps();
      return jsonResponse({
        port: PORT,
        localIps: ips,
        urls: ips.map((ip) => `http://${ip}:${PORT}`),
        localhost: `http://localhost:${PORT}`,
      });
    }

    // GET /api/samples
    if (url.pathname === "/api/samples" && method === "GET") {
      return jsonResponse({
        samples: [getSampleHeart(), getSamplePotion(), getSampleCat()],
      });
    }

    // GET /api/projects - list all projects
    if (url.pathname === "/api/projects" && method === "GET") {
      try {
        const list = projectRepository.getAll();
        return jsonResponse(list);
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // POST /api/projects - create new project
    if (url.pathname === "/api/projects" && method === "POST") {
      try {
        const body = await req.json();
        if (!body.name || !body.width || !body.height || !body.originalImage) {
          return jsonResponse({ error: "Missing required fields: name, width, height, originalImage" }, 400);
        }
        const created = projectRepository.create({
          name: body.name.trim(),
          width: Number(body.width),
          height: Number(body.height),
          originalImage: body.originalImage,
          changedColors: body.changedColors || {},
          completedPixels: body.completedPixels || [],
          completeStyle: body.completeStyle,
          backgroundColor: body.backgroundColor,
        });
        return jsonResponse(created, 201);
      } catch (err: any) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Single project routes: /api/projects/:id
    const projectMatch = url.pathname.match(/^\/api\/projects\/([^/]+)(\/(duplicate))?$/);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const action = projectMatch[3];

      // POST /api/projects/:id/duplicate
      if (action === "duplicate" && method === "POST") {
        const original = projectRepository.getById(projectId);
        if (!original) return jsonResponse({ error: "Project not found" }, 404);

        const copy = projectRepository.create({
          name: `${original.name} (Copy)`,
          width: original.width,
          height: original.height,
          originalImage: original.originalImage,
          changedColors: { ...original.changedColors },
          completedPixels: [...original.completedPixels],
          completeStyle: { ...original.completeStyle },
          backgroundColor: original.backgroundColor,
        });
        return jsonResponse(copy, 201);
      }

      // GET /api/projects/:id
      if (method === "GET") {
        const project = projectRepository.getById(projectId);
        if (!project) return jsonResponse({ error: "Project not found" }, 404);
        return jsonResponse(project);
      }

      // PUT /api/projects/:id
      if (method === "PUT") {
        try {
          const body = await req.json();
          const updated = projectRepository.update(projectId, {
            name: body.name !== undefined ? body.name.trim() : undefined,
            changedColors: body.changedColors,
            completedPixels: body.completedPixels,
            completeStyle: body.completeStyle,
            originalImage: body.originalImage,
            backgroundColor: body.backgroundColor,
          });
          if (!updated) return jsonResponse({ error: "Project not found" }, 404);
          return jsonResponse(updated);
        } catch (err: any) {
          return jsonResponse({ error: err.message }, 500);
        }
      }

      // DELETE /api/projects/:id
      if (method === "DELETE") {
        const ok = projectRepository.delete(projectId);
        if (!ok) return jsonResponse({ error: "Project not found" }, 404);
        return jsonResponse({ success: true, id: projectId });
      }
    }

    // ==========================================
    // STATIC FILE SERVING
    // ==========================================
    let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
    // Security check to avoid path traversal
    filePath = join(PUBLIC_DIR, filePath.replace(/^\/+/, ""));

    if (existsSync(filePath) && statSync(filePath).isFile()) {
      const ext = filePath.substring(filePath.lastIndexOf("."));
      const contentType = MIME_TYPES[ext] || "application/octet-stream";
      const file = Bun.file(filePath);
      return new Response(file, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache",
          ...corsHeaders(),
        },
      });
    }

    // Fallback to index.html for SPA if client side route
    const indexHtml = join(PUBLIC_DIR, "index.html");
    if (existsSync(indexHtml)) {
      return new Response(Bun.file(indexHtml), {
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          ...corsHeaders(),
        },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
});

const localIps = getLocalIps();
console.log(`\n🧵 Across Stitch Server active on port ${PORT}`);
console.log(`🖥️  PC Web Client:       http://localhost:${PORT}`);
for (const ip of localIps) {
  console.log(`📱 Android / LAN Client: http://${ip}:${PORT}`);
}
console.log(`🤖 Android Emulator:     http://10.0.2.2:${PORT}\n`);
