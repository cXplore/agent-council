import { NextRequest, NextResponse } from 'next/server';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

/**
 * Task queue for MCP server background processing.
 *
 * The web UI posts tasks here (e.g., "scan this project").
 * The MCP server's setInterval detects them and notifies Claude Code.
 * Results are written back here for the web UI to pick up.
 */

interface Task {
  id: string;
  type: 'scan_project';
  status: 'pending' | 'processing' | 'complete' | 'error';
  params: Record<string, unknown>;
  result?: unknown;
  createdAt: string;
  completedAt?: string;
}

const TASKS_FILE = path.join(process.cwd(), '.council-tasks.json');

async function loadTasks(): Promise<Task[]> {
  try {
    const data = await readFile(TASKS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveTasks(tasks: Task[]): Promise<void> {
  await writeFile(TASKS_FILE, JSON.stringify(tasks, null, 2), 'utf-8');
}

// GET — check for task results (web UI polls this)
export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  const tasks = await loadTasks();

  if (id) {
    const task = tasks.find(t => t.id === id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    return NextResponse.json(task, { headers: { 'Cache-Control': 'no-cache, no-store' } });
  }

  // Return pending/processing tasks
  const active = tasks.filter(t => t.status === 'pending' || t.status === 'processing');
  return NextResponse.json({ tasks: active }, { headers: { 'Cache-Control': 'no-cache, no-store' } });
}

// POST — create a new task (web UI calls this)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, params } = body;

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    const task: Task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: 'pending',
      params: params || {},
      createdAt: new Date().toISOString(),
    };

    const tasks = await loadTasks();
    tasks.push(task);

    // Keep last 20
    if (tasks.length > 20) tasks.splice(0, tasks.length - 20);

    await saveTasks(tasks);

    return NextResponse.json({ success: true, id: task.id });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}

// PATCH — update task status/result (MCP server or Claude Code calls this)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, status, result } = body;

    if (!id || !status) {
      return NextResponse.json({ error: 'id and status required' }, { status: 400 });
    }

    const tasks = await loadTasks();
    const task = tasks.find(t => t.id === id);
    if (!task) return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    task.status = status;
    if (result) task.result = result;
    if (status === 'complete' || status === 'error') {
      task.completedAt = new Date().toISOString();
    }

    await saveTasks(tasks);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
