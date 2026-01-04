import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';

export class UCIEngine extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private buffer: string = '';

  constructor(private enginePath: string) {
    super();
  }

  public start(): void {
    if (this.process) return;

    try {
      this.process = spawn(this.enginePath);

      this.process.stdout.on('data', (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split('\n');
        this.buffer = lines.pop() || ''; // Keep the last incomplete line

        for (const line of lines) {
          this.parseLine(line.trim());
        }
      });

      this.process.stderr.on('data', (data) => {
        console.error(`Engine Error: ${data}`);
      });

      this.process.on('close', (code) => {
        console.log(`Engine exited with code ${code}`);
        this.process = null;
        this.emit('quit');
      });

      this.send('uci');
    } catch (error) {
      console.error('Failed to start engine:', error);
      this.emit('error', error);
    }
  }

  public send(command: string): void {
    if (this.process) {
      console.log(`> ${command}`);
      this.process.stdin.write(command + '\n');
    }
  }

  public quit(): void {
    if (this.process) {
      this.send('quit');
      // Give it a moment to close gracefully, then kill if needed
      setTimeout(() => {
        if (this.process) {
          this.process.kill();
          this.process = null;
        }
      }, 1000);
    }
  }

  private parseLine(line: string): void {
    if (!line) return;
    // console.log(`< ${line}`); // Verbose logging

    const parts = line.split(' ');
    const command = parts[0];

    switch (command) {
      case 'uciok':
        this.emit('ready');
        break;
      case 'readyok':
        this.emit('readyok');
        break;
      case 'id':
        // id name Pikafish...
        break;
      case 'option':
        // option name ...
        break;
      case 'info':
        this.emit('info', this.parseInfo(parts.slice(1)));
        break;
      case 'bestmove':
        this.emit('bestmove', parts[1], parts[3]); // bestmove <move> [ponder <move>]
        break;
    }
  }

  private parseInfo(parts: string[]): any {
    const info: any = {};
    for (let i = 0; i < parts.length; i++) {
      const key = parts[i];
      const value = parts[i + 1];
      
      if (key === 'depth') info.depth = parseInt(value);
      if (key === 'score') {
        info.scoreType = value; // cp or mate
        info.scoreValue = parseInt(parts[i + 2]);
        i += 2;
      }
      if (key === 'pv') {
        info.pv = parts.slice(i + 1).join(' ');
        break; // pv is usually the last part
      }
    }
    return info;
  }
}
