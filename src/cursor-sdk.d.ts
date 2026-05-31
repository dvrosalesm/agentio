declare module "@cursor/sdk" {
  export class Agent {
    static create(options: {
      apiKey: string;
      model: { id: string };
      local: { cwd: string };
    }): Promise<
      AsyncDisposable & {
        send(body: string): Promise<{ wait(): Promise<{ result?: string }> }>;
      }
    >;
  }
}
