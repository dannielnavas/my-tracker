import { TaskResponse } from '@/core/models/task.model';
import { Task as TaskService } from '@/core/services/task';
import { Header } from '@/shared/components/header/header';
import {
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import TimerPomodoro, { TimerState } from 'timer-for-pomodoro';

@Component({
  selector: 'app-timer',
  imports: [Header],
  templateUrl: './timer.html',
  styleUrl: './timer.css',
})
export default class Timer implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly taskService = inject(TaskService);
  private audio: HTMLAudioElement | null = null;
  statusTimer = signal<string>('init');
  user_id = computed(() => localStorage.getItem('user_id'));

  resourcesTasks = rxResource<TaskResponse[], { user_id: number }>({
    stream: ({ params }) => this.taskService.getTasks(params.user_id),
    params: () => ({
      user_id: Number(this.user_id()) || 0,
    }),
    defaultValue: [],
  });

  task = computed(() => {
    const tasks = this.resourcesTasks.value();
    if (!tasks) return undefined;
    return tasks.find((task) => task.statusTask.status_task_id === 2);
  });
  timer = new TimerPomodoro(60, 15, 999);
  timerState = signal<TimerState | undefined>(undefined);
  totalTime = signal<number>(0);
  status = signal<boolean>(false);

  ngOnInit() {
    this.setFloatingWindow();
    this.toggleTitlebarAndMenu(false);
  }

  ngOnDestroy() {
    this.resetFloatingWindow();
    this.toggleTitlebarAndMenu(true);
  }

  private async setFloatingWindow() {
    if (!window.electronAPI) return;
    try {
      const { userAgent } = navigator;
      if (userAgent.includes('Windows') || userAgent.includes('Linux')) {
        await window.electronAPI.makeWindowFloating(432, 160);
      } else if (userAgent.includes('Macintosh')) {
        await window.electronAPI.makeWindowFloating(306, 80);
      }
      await window.electronAPI.moveWindow(0, 50);
    } catch (error) {
      console.error('Error al hacer la ventana flotante:', error);
    }
  }

  private async resetFloatingWindow() {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.resetWindowFloating();
    } catch (error) {
      console.error('Error al restaurar el estado de la ventana:', error);
    }
  }

  private toggleTitlebarAndMenu(show: boolean) {
    if (window.electronAPI) {
      if (show) {
        window.electronAPI.showTitlebar?.();
        window.electronAPI.showMenu?.();
      } else {
        window.electronAPI.hideTitlebar?.();
        window.electronAPI.hideMenu?.();
      }
    } else if ((window as any).electron?.ipcRenderer) {
      (window as any).electron.ipcRenderer.invoke(
        show ? 'show-menu' : 'hide-menu'
      );
    }
  }

  start() {
    this.timer.start();
    this.status.set(true);
    this.listenTimer();
  }

  pause() {
    this.timer.pause();
    this.status.set(false);
  }

  play() {
    this.timer.start();
    this.status.set(true);
  }

  listenTimer() {
    this.timer.subscribe((timerState) => {
      this.timerState.set(timerState);
      if (this.statusTimer() !== timerState.status) {
        this.statusTimer.set(timerState.status || 'init');
        this.playAudioForStatus(timerState.status);
      }
      if (timerState.status === 'work') {
        this.totalTime.update((current) => current + 1);
      }
    });
  }

  private playAudioForStatus(status: string | undefined) {
    if (!status) return;
    let audioFile = '';
    if (status === 'work') audioFile = 'assets/start.mp3';
    if (status === 'break') audioFile = 'assets/break.mp3';
    if (audioFile) {
      this.audio = new Audio(audioFile);
      this.audio.volume = 0.5;
      this.audio.play();
    }
  }

  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds
      .toString()
      .padStart(2, '0')}`;
  }

  getProgressAngle(): number {
    const state = this.timerState();
    if (!state) return 0;
    const totalSeconds = state.minutes * 60 + state.seconds;
    const workTimeSeconds = state.settings.workTime * 60;
    const progress = (workTimeSeconds - totalSeconds) / workTimeSeconds;
    return Math.max(0, Math.min(360, progress * 360));
  }

  formatTotalTime(): string {
    const totalMinutes = Math.floor(this.totalTime() / 60);
    const totalHours = Math.floor(totalMinutes / 60);
    const remainingMinutes = totalMinutes % 60;
    if (totalHours > 0) {
      return `${totalHours}h ${remainingMinutes}m`;
    }
    return `${totalMinutes}m`;
  }

  goToNextTask() {
    this.timer.stop();
    this.taskService
      .updateTask(this.task()?.task_id || 0, {
        status_task_id: 3,
      })
      .subscribe({
        next: () => {
          this.router.navigate(['/private/work']);
        },
      });
  }

  backToWork() {
    this.timer.stop();
    this.router.navigate(['/private/work']);
  }
}
