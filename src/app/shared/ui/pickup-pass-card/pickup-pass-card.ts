import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

interface PickupQrCell {
  key: string;
  x: number;
  y: number;
}

const PICKUP_QR_SIZE = 21;

@Component({
  selector: 'app-pickup-pass-card',
  templateUrl: './pickup-pass-card.html',
  styleUrl: './pickup-pass-card.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PickupPassCardComponent {
  readonly title = input('Pickup QR');
  readonly subtitle = input<string | null>(null);
  readonly token = input.required<string>();
  readonly payload = input.required<string>();
  readonly amountLabel = input<string | null>(null);

  protected readonly viewBox = `0 0 ${PICKUP_QR_SIZE} ${PICKUP_QR_SIZE}`;
  protected readonly cells = computed(() => buildPickupQrCells(this.payload()));
}

function buildPickupQrCells(payload: string): PickupQrCell[] {
  const matrix = Array.from({ length: PICKUP_QR_SIZE }, () => Array<boolean>(PICKUP_QR_SIZE).fill(false));
  const locked = Array.from({ length: PICKUP_QR_SIZE }, () => Array<boolean>(PICKUP_QR_SIZE).fill(false));

  drawFinder(matrix, locked, 0, 0);
  drawFinder(matrix, locked, PICKUP_QR_SIZE - 7, 0);
  drawFinder(matrix, locked, 0, PICKUP_QR_SIZE - 7);
  drawTiming(matrix, locked);

  let seed = hashPayload(payload || 'SAVR');
  for (let row = 0; row < PICKUP_QR_SIZE; row += 1) {
    for (let column = 0; column < PICKUP_QR_SIZE; column += 1) {
      if (locked[row][column]) {
        continue;
      }

      seed = nextSeed(seed);
      matrix[row][column] = (seed & 1) === 1;
    }
  }

  const cells: PickupQrCell[] = [];
  for (let row = 0; row < PICKUP_QR_SIZE; row += 1) {
    for (let column = 0; column < PICKUP_QR_SIZE; column += 1) {
      if (!matrix[row][column]) {
        continue;
      }

      cells.push({
        key: `${column}-${row}`,
        x: column,
        y: row,
      });
    }
  }

  return cells;
}

function drawFinder(matrix: boolean[][], locked: boolean[][], startX: number, startY: number): void {
  for (let row = 0; row < 7; row += 1) {
    for (let column = 0; column < 7; column += 1) {
      const isOuterFrame = row === 0 || row === 6 || column === 0 || column === 6;
      const isInnerCore = row >= 2 && row <= 4 && column >= 2 && column <= 4;
      matrix[startY + row][startX + column] = isOuterFrame || isInnerCore;
      locked[startY + row][startX + column] = true;
    }
  }

  const quietZoneStartX = Math.max(0, startX - 1);
  const quietZoneEndX = Math.min(PICKUP_QR_SIZE - 1, startX + 7);
  const quietZoneStartY = Math.max(0, startY - 1);
  const quietZoneEndY = Math.min(PICKUP_QR_SIZE - 1, startY + 7);

  for (let row = quietZoneStartY; row <= quietZoneEndY; row += 1) {
    for (let column = quietZoneStartX; column <= quietZoneEndX; column += 1) {
      if (column >= startX && column <= startX + 6 && row >= startY && row <= startY + 6) {
        continue;
      }

      matrix[row][column] = false;
      locked[row][column] = true;
    }
  }
}

function drawTiming(matrix: boolean[][], locked: boolean[][]): void {
  for (let index = 8; index < PICKUP_QR_SIZE - 8; index += 1) {
    const filled = index % 2 === 0;
    matrix[6][index] = filled;
    matrix[index][6] = filled;
    locked[6][index] = true;
    locked[index][6] = true;
  }
}

function hashPayload(payload: string): number {
  let hash = 2166136261;
  for (let index = 0; index < payload.length; index += 1) {
    hash ^= payload.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function nextSeed(seed: number): number {
  let next = seed || 1;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  return next >>> 0;
}
