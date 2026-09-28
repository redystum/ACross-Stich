// Helper to generate pixel-art PNG data URLs without external libraries
// Generates uncompressed PNG directly with valid PNG header and chunks

function createPngDataUrl(width: number, height: number, getPixel: (x: number, y: number) => [number, number, number, number]): string {
  // Simple BMP or raw data URL via Canvas or BMP format.
  // BMP is simple, uncompressed, and universally supported by all browsers and <img> tags!
  const fileHeaderSize = 14;
  const infoHeaderSize = 40;
  const rowSize = Math.floor((32 * width + 31) / 32) * 4; // 32 bpp
  const pixelArraySize = rowSize * height;
  const fileSize = fileHeaderSize + infoHeaderSize + pixelArraySize;

  const buffer = new Uint8Array(fileSize);
  const view = new DataView(buffer.buffer);

  // Bitmap File Header
  buffer[0] = 0x42; // 'B'
  buffer[1] = 0x4D; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(6, 0, true); // Reserved
  view.setUint32(10, fileHeaderSize + infoHeaderSize, true); // Pixel array offset

  // DIB Header (BITMAPINFOHEADER)
  view.setUint32(14, infoHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, -height, true); // Top-down order (negative height)
  view.setUint16(26, 1, true); // Planes
  view.setUint16(28, 32, true); // 32 bits per pixel (BGRA)
  view.setUint32(30, 0, true); // BI_RGB (uncompressed)
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true); // 72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = fileHeaderSize + infoHeaderSize;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = getPixel(x, y);
      buffer[offset] = b;
      buffer[offset + 1] = g;
      buffer[offset + 2] = r;
      buffer[offset + 3] = a;
      offset += 4;
    }
  }

  // Convert buffer to base64
  let binary = "";
  const bytes = buffer;
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return "data:image/bmp;base64," + btoa(binary);
}

// Color helpers
const hexToRgba = (hex: string, alpha = 255): [number, number, number, number] => {
  const cleanHex = hex.replace("#", "");
  const num = parseInt(cleanHex, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, alpha];
};

export function getSampleHeart(): {
  name: string;
  width: number;
  height: number;
  originalImage: string;
  completedPixels: string[];
} {
  const width = 16;
  const height = 16;

  // 16x16 Heart Pixel Art
  // . = transparent, # = outline (black), R = red, H = highlight (pink/white), D = dark red
  const art = [
    "................",
    "....##....##....",
    "..##RR##..##RR##",
    ".#RRHHRR##RRRRRR#",
    ".#RRHHRRRRRRRRRR#",
    "#RRRRRRRRRRRRRRR#",
    "#RRRRRRRRRRRRRRR#",
    "#RRRRRRRRRRRRRRR#",
    ".#RRRRRRRRRRRRR#",
    "..#RRRRRRRRRRR#.",
    "...#RRRRRRRRR#..",
    "....#RRRRRRR#...",
    ".....#RRRRR#....",
    "......#RRR#.....",
    ".......#R#......",
    "........#.......",
  ];

  const colorMap: Record<string, [number, number, number, number]> = {
    ".": [0, 0, 0, 0],
    "#": hexToRgba("#27272a"),
    "R": hexToRgba("#e11d48"),
    "H": hexToRgba("#fda4af"),
    "D": hexToRgba("#9f1239"),
  };

  const originalImage = createPngDataUrl(width, height, (x, y) => {
    const char = art[y]?.[x] || ".";
    return colorMap[char] || [0, 0, 0, 0];
  });

  // Pre-mark a few pixels as completed to demonstrate the completed pixels feature right away!
  const completedPixels = [
    "4,2", "5,2", "10,2", "11,2",
    "3,3", "4,3", "5,3", "6,3",
    "3,4", "4,4", "5,4", "6,4",
  ];

  return {
    name: "Classic Pixel Heart",
    width,
    height,
    originalImage,
    completedPixels,
  };
}

export function getSamplePotion(): {
  name: string;
  width: number;
  height: number;
  originalImage: string;
  completedPixels: string[];
} {
  const width = 16;
  const height = 16;

  // 16x16 Health Potion
  // . = transparent, C = cork, G = glass/outline, L = liquid, H = liquid highlight, B = bubble
  const art = [
    "................",
    "......####......",
    "......#CC#......",
    "......#CC#......",
    ".....######.....",
    "....#GGGGGG#....",
    "...#GGGGGGGG#...",
    "..#GGLLLLLLGG#..",
    "..#GLLHLLLLLL#..",
    "..#GLLHLLLLBL#..",
    "..#GLLLLLLLLL#..",
    "..#GLLLLLLLLL#..",
    "...#GGLLLLLL#...",
    "....#GGGGGG#....",
    ".....######.....",
    "................",
  ];

  const colorMap: Record<string, [number, number, number, number]> = {
    ".": [0, 0, 0, 0],
    "#": hexToRgba("#18181b"),
    "C": hexToRgba("#b45309"),
    "G": hexToRgba("#94a3b8"),
    "L": hexToRgba("#0284c7"),
    "H": hexToRgba("#7dd3fc"),
    "B": hexToRgba("#e0f2fe"),
  };

  const originalImage = createPngDataUrl(width, height, (x, y) => {
    const char = art[y]?.[x] || ".";
    return colorMap[char] || [0, 0, 0, 0];
  });

  const completedPixels = ["7,7", "8,7", "9,7", "6,8", "7,8", "8,8"];

  return {
    name: "Magic Mana Potion",
    width,
    height,
    originalImage,
    completedPixels,
  };
}

export function getSampleCat(): {
  name: string;
  width: number;
  height: number;
  originalImage: string;
  completedPixels: string[];
} {
  const width = 16;
  const height = 16;

  // 16x16 Cute Cat
  const art = [
    "................",
    "...##......##...",
    "..#PP#....#PP#..",
    "..#OO#....#OO#..",
    ".#OOOO####OOOO#.",
    ".#OOOOOOOOOOOO#.",
    ".#O##OOOOOO##O#.",
    ".#O##OOOOOO##O#.",
    ".#OOOOOPPOOOOO#.",
    "..#OOOOWWOOOO#..",
    "...#OOOOOOOO#...",
    "..#OOOOOOOOOO#..",
    ".#OOOOOOOOOOOO#.",
    ".#OO#OOOOOO#OO#.",
    "..##.######.##..",
    "................",
  ];

  const colorMap: Record<string, [number, number, number, number]> = {
    ".": [0, 0, 0, 0],
    "#": hexToRgba("#27272a"),
    "O": hexToRgba("#f97316"),
    "P": hexToRgba("#f472b6"),
    "W": hexToRgba("#f8fafc"),
  };

  const originalImage = createPngDataUrl(width, height, (x, y) => {
    const char = art[y]?.[x] || ".";
    return colorMap[char] || [0, 0, 0, 0];
  });

  const completedPixels = ["3,1", "4,1", "11,1", "12,1", "2,2", "5,2", "10,2", "13,2"];

  return {
    name: "Ginger Kitty",
    width,
    height,
    originalImage,
    completedPixels,
  };
}
