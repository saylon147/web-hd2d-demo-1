export function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
}
export class FrameMetrics {
  private previous = 0;
  private frames = 0;
  private intervals: number[] = [];
  private submissions: number[] = [];
  reset(): void { this.previous = 0; this.frames = 0; this.intervals = []; this.submissions = []; }
  sample(time: number, submissionMs: number): boolean {
    const interval = this.previous ? time - this.previous : 0;
    this.previous = time; this.frames++;
    if (this.frames > 60 && this.intervals.length < 120 && interval > 0) { this.intervals.push(interval); this.submissions.push(submissionMs); }
    return this.intervals.length === 120;
  }
  report(): { frames: number; frameMeanMs: number; frameMedianMs: number; frameP95Ms: number; fps: number; cpuSubmissionP95Ms: number } {
    const mean = this.intervals.reduce((sum, value) => sum + value, 0) / Math.max(1, this.intervals.length);
    return { frames: this.intervals.length, frameMeanMs: mean, frameMedianMs: percentile(this.intervals, 0.5), frameP95Ms: percentile(this.intervals, 0.95), fps: mean ? 1000 / mean : 0, cpuSubmissionP95Ms: percentile(this.submissions, 0.95) };
  }
}
