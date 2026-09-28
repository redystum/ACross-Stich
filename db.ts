import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync, mkdirSync } from "fs";

// Ensure data directory exists
const DATA_DIR = join(import.meta.dir, "data");
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(join(DATA_DIR, "projects.db"), { create: true });

// Initialize database schema
db.run(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    original_image TEXT NOT NULL,
    changed_colors TEXT NOT NULL DEFAULT '{}',
    completed_pixels TEXT NOT NULL DEFAULT '[]',
    complete_style TEXT NOT NULL DEFAULT '{"color":"#10b981","opacity":0.7,"mode":"tint","hideCompleted":false}',
    background_color TEXT DEFAULT '#ffffff',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

try {
  db.run(`ALTER TABLE projects ADD COLUMN background_color TEXT DEFAULT '#ffffff'`);
} catch (_) {}

export interface CompleteStyle {
  color: string;
  opacity: number;
  mode: "tint" | "solid" | "cross" | "dot";
  hideCompleted: boolean;
}

export interface ProjectRecord {
  id: string;
  name: string;
  width: number;
  height: number;
  original_image: string;
  changed_colors: string; // JSON: Record<string, string>
  completed_pixels: string; // JSON: string[]
  complete_style: string; // JSON: CompleteStyle
  background_color?: string;
  created_at: string;
  updated_at: string;
}

export interface ProjectDTO {
  id: string;
  name: string;
  width: number;
  height: number;
  originalImage: string;
  changedColors: Record<string, string>;
  completedPixels: string[];
  completeStyle: CompleteStyle;
  backgroundColor: string;
  createdAt: string;
  updatedAt: string;
  totalPixels?: number;
  completedCount?: number;
}

export interface ProjectSummaryDTO {
  id: string;
  name: string;
  width: number;
  height: number;
  originalImage: string;
  changedColorsCount: number;
  completedCount: number;
  totalPixels: number;
  completeStyle: CompleteStyle;
  createdAt: string;
  updatedAt: string;
}

// Convert DB row to DTO
export function toProjectDTO(row: ProjectRecord): ProjectDTO {
  let changedColors: Record<string, string> = {};
  let completedPixels: string[] = [];
  let completeStyle: CompleteStyle = {
    color: "#10b981",
    opacity: 0.7,
    mode: "tint",
    hideCompleted: false,
  };

  try {
    changedColors = JSON.parse(row.changed_colors || "{}");
  } catch {}
  try {
    completedPixels = JSON.parse(row.completed_pixels || "[]");
  } catch {}
  try {
    completeStyle = JSON.parse(row.complete_style || "{}");
  } catch {}

  return {
    id: row.id,
    name: row.name,
    width: row.width,
    height: row.height,
    originalImage: row.original_image,
    changedColors,
    completedPixels,
    completeStyle,
    backgroundColor: row.background_color || "#ffffff",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    totalPixels: row.width * row.height,
    completedCount: completedPixels.length,
  };
}

export function toProjectSummaryDTO(row: ProjectRecord): ProjectSummaryDTO {
  const dto = toProjectDTO(row);
  return {
    id: dto.id,
    name: dto.name,
    width: dto.width,
    height: dto.height,
    originalImage: dto.originalImage,
    changedColorsCount: Object.keys(dto.changedColors).length,
    completedCount: dto.completedPixels.length,
    totalPixels: dto.totalPixels || dto.width * dto.height,
    completeStyle: dto.completeStyle,
    backgroundColor: dto.backgroundColor,
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  };
}

// Database helper functions
export const projectRepository = {
  getAll(): ProjectSummaryDTO[] {
    const rows = db.query("SELECT * FROM projects ORDER BY updated_at DESC").all() as ProjectRecord[];
    return rows.map(toProjectSummaryDTO);
  },

  getById(id: string): ProjectDTO | null {
    const row = db.query("SELECT * FROM projects WHERE id = ?").get(id) as ProjectRecord | null;
    return row ? toProjectDTO(row) : null;
  },

  create(data: {
    id?: string;
    name: string;
    width: number;
    height: number;
    originalImage: string;
    changedColors?: Record<string, string>;
    completedPixels?: string[];
    completeStyle?: CompleteStyle;
    backgroundColor?: string;
  }): ProjectDTO {
    const id = data.id || `proj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const now = new Date().toISOString();
    const changedColorsStr = JSON.stringify(data.changedColors || {});
    const completedPixelsStr = JSON.stringify(data.completedPixels || []);
    const completeStyleStr = JSON.stringify(
      data.completeStyle || {
        color: "#10b981",
        opacity: 0.7,
        mode: "tint",
        hideCompleted: false,
      }
    );
    const backgroundColor = data.backgroundColor || "#ffffff";

    db.run(
      `INSERT INTO projects (id, name, width, height, original_image, changed_colors, completed_pixels, complete_style, background_color, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.name,
        data.width,
        data.height,
        data.originalImage,
        changedColorsStr,
        completedPixelsStr,
        completeStyleStr,
        backgroundColor,
        now,
        now,
      ]
    );

    return this.getById(id)!;
  },

  update(
    id: string,
    data: {
      name?: string;
      changedColors?: Record<string, string>;
      completedPixels?: string[];
      completeStyle?: CompleteStyle;
      originalImage?: string;
      backgroundColor?: string;
    }
  ): ProjectDTO | null {
    const existing = this.getById(id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const name = data.name !== undefined ? data.name : existing.name;
    const changedColorsStr =
      data.changedColors !== undefined
        ? JSON.stringify(data.changedColors)
        : JSON.stringify(existing.changedColors);
    const completedPixelsStr =
      data.completedPixels !== undefined
        ? JSON.stringify(data.completedPixels)
        : JSON.stringify(existing.completedPixels);
    const completeStyleStr =
      data.completeStyle !== undefined
        ? JSON.stringify(data.completeStyle)
        : JSON.stringify(existing.completeStyle);
    const originalImage =
      data.originalImage !== undefined ? data.originalImage : existing.originalImage;
    const backgroundColor =
      data.backgroundColor !== undefined ? data.backgroundColor : (existing.backgroundColor || "#ffffff");

    db.run(
      `UPDATE projects 
       SET name = ?, changed_colors = ?, completed_pixels = ?, complete_style = ?, original_image = ?, background_color = ?, updated_at = ?
       WHERE id = ?`,
      [name, changedColorsStr, completedPixelsStr, completeStyleStr, originalImage, backgroundColor, now, id]
    );

    return this.getById(id);
  },

  delete(id: string): boolean {
    const result = db.run("DELETE FROM projects WHERE id = ?", [id]);
    return result.changes > 0;
  },

  count(): number {
    const res = db.query("SELECT COUNT(*) as count FROM projects").get() as { count: number };
    return res.count;
  },
};
