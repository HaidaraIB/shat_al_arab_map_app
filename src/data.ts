import { Unit, UnitStatus, Block } from './types';

const generateUnits = (blockId: string, count: number, soldIndices: number[]): Unit[] => {
  const category = blockId.startsWith('A') ? 'A' : blockId.startsWith('B') ? 'B' : 'C';
  
  const stats = {
    'A': { price: 250000000, area: 200 },
    'B': { price: 220000000, area: 200 },
    'C': { price: 180000000, area: 200 }
  };

  const { price: basePrice, area: baseArea } = stats[category];

  return Array.from({ length: count }, (_, i) => {
    const num = (i + 1).toString().padStart(2, '0');
    // Corner units logic (simplified)
    const isCorner = i === 0 || i === count - 1 || (count > 20 && (i === Math.floor(count/2) || i === Math.floor(count/2) - 1));
    const unitType: 'ركن' | 'عادي' = isCorner ? 'ركن' : 'عادي';
    
    const finalPrice = unitType === 'ركن' ? basePrice * 1.15 : basePrice;
    const finalArea = unitType === 'ركن' ? baseArea + 20 : baseArea;

    return {
      id: `${blockId}-${num}`,
      block: blockId,
      number: num,
      status: soldIndices.includes(i + 1) ? UnitStatus.SOLD : UnitStatus.AVAILABLE,
      price: finalPrice,
      area: finalArea,
      unitType,
      category
    };
  });
};

export const INITIAL_DATA: Block[] = [
  // Top Cluster (North) - 50m Wide Road area
  { 
    id: 'A8', name: 'A8', 
    units: generateUnits('A8', 30, [1, 2, 3, 28, 29, 30]),
    layout: { x: 74, y: 3, w: 18, h: 5, cols: 15, rows: 2 }
  },
  { 
    id: 'A7', name: 'A7', 
    units: generateUnits('A7', 43, [1, 10, 43]),
    layout: { x: 68, y: 12, w: 5, h: 18, cols: 2, rows: 22, isVertical: true }
  },
  { 
    id: 'A6', name: 'A6', 
    units: generateUnits('A6', 50, [1, 25, 50]),
    layout: { x: 78, y: 22, w: 18, h: 5, cols: 25, rows: 2 }
  },
  { 
    id: 'A5', name: 'A5', 
    units: generateUnits('A5', 23, [1, 12, 23]),
    layout: { x: 50, y: 6, w: 14, h: 5, cols: 12, rows: 2 }
  },

  // Western Column (Slanted/Sloped)
  { 
    id: 'A4', name: 'A4', 
    units: generateUnits('A4', 32, [1, 16, 32]),
    layout: { x: 26, y: 10, w: 7, h: 18, cols: 2, rows: 16, isVertical: true }
  },
  { 
    id: 'A3', name: 'A3', 
    units: generateUnits('A3', 38, [1, 19, 38]),
    layout: { x: 22, y: 32, w: 7, h: 22, cols: 2, rows: 19, isVertical: true }
  },
  { 
    id: 'A2', name: 'A2', 
    units: generateUnits('A2', 22, [1, 11, 22]),
    layout: { x: 19, y: 58, w: 6, h: 14, cols: 2, rows: 11, isVertical: true }
  },
  { 
    id: 'A1', name: 'A1', 
    units: generateUnits('A1', 22, [1, 11, 22]),
    layout: { x: 15, y: 75, w: 6, h: 14, cols: 2, rows: 11, isVertical: true }
  },
  { 
    id: 'B1', name: 'B1', 
    units: generateUnits('B1', 14, [1, 7, 14]),
    layout: { x: 10, y: 92, w: 5, h: 8, cols: 2, rows: 7, isVertical: true }
  },

  // Centered Commercial/Public Blocks
  { 
    id: 'B2', name: 'B2', 
    units: generateUnits('B2', 32, [1, 16, 32]),
    layout: { x: 42, y: 55, w: 6, h: 22, cols: 2, rows: 16, isVertical: true }
  },
  { 
    id: 'B3', name: 'B3', 
    units: generateUnits('B3', 30, [1, 15, 30]),
    layout: { x: 50, y: 55, w: 6, h: 20, cols: 2, rows: 15, isVertical: true }
  },

  // Staggered Horizontal Stacks (Eastern Section)
  { 
    id: 'C9', name: 'C9', 
    units: generateUnits('C9', 28, [1, 14, 28]),
    layout: { x: 74, y: 34, w: 14, h: 5, cols: 14, rows: 2 }
  },
  { 
    id: 'C8', name: 'C8', 
    units: generateUnits('C8', 28, [1, 14, 28]),
    layout: { x: 72, y: 42, w: 14, h: 5, cols: 14, rows: 2 }
  },
  { 
    id: 'C7', name: 'C7', 
    units: generateUnits('C7', 28, [1, 14, 28]),
    layout: { x: 70, y: 50, w: 14, h: 5, cols: 14, rows: 2 }
  },
  { 
    id: 'C6', name: 'C6', 
    units: generateUnits('C6', 28, [1, 14, 28]),
    layout: { x: 68, y: 58, w: 14, h: 5, cols: 14, rows: 2 }
  },
  { 
    id: 'C5', name: 'C5', 
    units: generateUnits('C5', 28, [1, 14, 28]),
    layout: { x: 66, y: 66, w: 14, h: 5, cols: 14, rows: 2 }
  },
  { 
    id: 'C3', name: 'C3', 
    units: generateUnits('C3', 40, [1, 20, 40]),
    layout: { x: 64, y: 74, w: 16, h: 5, cols: 20, rows: 2 }
  },

  // Southern Border Blocks
  { 
    id: 'B4', name: 'B4', 
    units: generateUnits('B4', 40, [1, 20, 40]),
    layout: { x: 25, y: 88, w: 15, h: 5, cols: 20, rows: 2 }
  },
  { 
    id: 'B5', name: 'B5', 
    units: generateUnits('B5', 40, [1, 20, 40]),
    layout: { x: 42, y: 92, w: 15, h: 5, cols: 20, rows: 2 }
  },

  // Inner Blocks (C1, C2)
  { 
    id: 'C2', name: 'C2', 
    units: generateUnits('C2', 30, [1, 15, 30]),
    layout: { x: 58, y: 82, w: 12, h: 5, cols: 15, rows: 2 }
  },
  { 
    id: 'C1', name: 'C1', 
    units: generateUnits('C1', 28, [1, 14, 28]),
    layout: { x: 56, y: 90, w: 12, h: 5, cols: 14, rows: 2 }
  },

  // Far Eastern Vertical Axis
  { 
    id: 'C10', name: 'C10', 
    units: generateUnits('C10', 33, [10, 11, 25, 26]),
    layout: { x: 94, y: 15, w: 4, h: 75, cols: 1, rows: 33, isVertical: true }
  }

];
