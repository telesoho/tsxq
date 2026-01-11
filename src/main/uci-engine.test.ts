import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UCIEngine } from './uci-engine';
import { join } from 'path';
import { existsSync } from 'fs';

// Real engine path (assuming standard project structure)
const ENGINE_PATH = join(process.cwd(), 'resources/bin/pikafish.exe');

// Check if engine exists before running tests
if (!existsSync(ENGINE_PATH)) {
    console.warn(`Engine not found at ${ENGINE_PATH}. Skipping real engine tests.`);
}

describe('UCIEngine (Integration)', () => {
  let engine: UCIEngine;

  beforeEach(() => {
    // We only mock timers to speed up the restart delay test
    // We do NOT mock child_process
    vi.useFakeTimers();
    
    // Ensure engine exists
    if (!existsSync(ENGINE_PATH)) {
        throw new Error(`Engine executable not found at ${ENGINE_PATH}`);
    }
    
    engine = new UCIEngine(ENGINE_PATH);
  });

  afterEach(() => {
    // Cleanup: Ensure engine is stopped
    try {
        engine.quit();
    } catch (e) {}
    
    vi.useRealTimers();
  });

  it('should start the engine and perform handshake', async () => {
    const readyPromise = new Promise<void>((resolve) => {
        engine.on('ready', () => resolve());
    });
    
    engine.start();
    
    // Wait for engine to be ready (uci -> uciok)
    // Real engine might take a bit, but usually < 100ms for uciok
    await expect(readyPromise).resolves.toBeUndefined();
    
    // Access private process to verify it exists
    const process = (engine as any).process;
    expect(process).toBeDefined();
    expect(process.pid).toBeDefined();
  });

  it('should restart automatically on crash (real kill)', async () => {
    // 1. Start engine
    const readyPromise = new Promise<void>((resolve) => {
        engine.on('ready', () => resolve());
    });
    engine.start();
    await readyPromise;
    
    const initialPid = (engine as any).process.pid;
    expect(initialPid).toBeDefined();
    
    // 2. Setup crash listener
    const crashPromise = new Promise<number>((resolve) => {
        engine.on('crashed', (code) => resolve(code));
    });
    
    // 3. Kill the process directly
    process.kill((engine as any).process.pid);
    
    // 4. Wait for crash event
    const code = await crashPromise;
    expect(code).not.toBe(0); // Should be non-zero for kill
    
    // 5. Verify it's waiting for restart (process should be null)
    expect((engine as any).process).toBeNull();
    
    // 6. Fast-forward time to trigger restart
    // Note: Since we are using real process, the 'close' event loop cycle 
    // needs to complete before our timer advances take effect?
    // Actually, setTimeout in UCIEngine will be controlled by FakeTimers.
    
    // We need to wait for the restart to happen
    const restartPromise = new Promise<void>((resolve) => {
        engine.once('ready', () => resolve()); // Listen for ready again
    });
    
    vi.advanceTimersByTime(3000);
    
    await restartPromise;
    
    // 7. Verify new process started
    const newPid = (engine as any).process.pid;
    expect(newPid).toBeDefined();
    expect(newPid).not.toBe(initialPid);
  });

  it('should NOT restart on intentional quit', async () => {
    const readyPromise = new Promise<void>((resolve) => {
        engine.on('ready', () => resolve());
    });
    engine.start();
    await readyPromise;
    
    const quitPromise = new Promise<void>((resolve) => {
        engine.on('quit', () => resolve());
    });
    
    const crashSpy = vi.fn();
    engine.on('crashed', crashSpy);
    
    // Intentional quit
    engine.quit();
    
    await quitPromise;
    
    // Verify process is null
    expect((engine as any).process).toBeNull();
    
    // Fast forward to ensure no restart happens
    vi.advanceTimersByTime(5000);
    
    expect(crashSpy).not.toHaveBeenCalled();
    expect((engine as any).process).toBeNull();
  });
});

