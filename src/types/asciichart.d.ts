declare module 'asciichart' {
  interface PlotOptions {
    height?: number;
    format?: (x: number) => string;
    min?: number;
    max?: number;
    offset?: number;
    padding?: string;
    colors?: string[];
  }

  function plot(data: number[], options?: PlotOptions): string;

  export = { plot };
}