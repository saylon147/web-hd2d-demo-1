// Sample the center of the existing courtyard paving from the entrance toward the cottage.
const road = Array.from({ length: 12 }, (_, row) => ({
  x: -2.7 + 4.8 * (row / 12) ** 1.35,
  z: 6.2 - row * 0.55,
}));
const lengths = [0];
for (let i = 1; i < road.length; i++) {
  const a = road[i - 1]!, b = road[i]!;
  lengths.push(lengths[i - 1]! + Math.hypot(b.x - a.x, b.z - a.z));
}
export const roadLength = lengths.at(-1)!;

export class RoadWalk {
  distance = 0;
  heading = 1;
  rest = 0.5;

  advance(seconds: number, speed: number) {
    while (seconds > 0) {
      if (this.rest > 0) {
        const waited = Math.min(seconds, this.rest);
        this.rest -= waited;
        seconds -= waited;
        continue;
      }
      const end = this.heading > 0 ? roadLength : 0;
      if (this.distance === end) this.heading *= -1;
      const destination = this.heading > 0 ? roadLength : 0;
      const travelTime = Math.abs(destination - this.distance) / speed;
      if (seconds < travelTime) {
        this.distance += seconds * speed * this.heading;
        return;
      }
      this.distance = destination;
      seconds -= travelTime;
      this.rest = 0.5;
    }
  }

  sample() {
    let i = 1;
    while (i < road.length - 1 && this.distance > lengths[i]!) i++;
    const a = road[i - 1]!, b = road[i]!;
    const t = (this.distance - lengths[i - 1]!) / (lengths[i]! - lengths[i - 1]!);
    return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t,
      dx: (b.x - a.x) * this.heading, dz: (b.z - a.z) * this.heading };
  }
}

export function facing(dx: number, dz: number, viewX: number, viewZ: number) {
  const right = dx * viewZ - dz * viewX;
  const front = dx * viewX + dz * viewZ;
  if (Math.abs(right) > Math.abs(front)) return right > 0 ? 'right' : 'left';
  return front > 0 ? 'front' : 'back';
}
