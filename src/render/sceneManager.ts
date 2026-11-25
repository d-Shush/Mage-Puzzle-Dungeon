import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Dungeon } from '../core/dungeon';
import type { RoomInstance } from '../core/types';
import { buildRoomObject, disposeRoomObject, type RoomObject } from './roomMesh';

const SELECTED_EMISSIVE = new THREE.Color(0x553300);
const NO_EMISSIVE = new THREE.Color(0x000000);

/**
 * Owns the Three.js scene and keeps it in sync with the Dungeon state.
 * Rendering is a pure projection of the state: on every change the affected
 * room objects are rebuilt, nothing in here mutates the dungeon.
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;

  private readonly roomObjects = new Map<string, { obj: RoomObject; room: RoomInstance }>();
  private readonly raycaster = new THREE.Raycaster();
  private selectedId: string | undefined;
  private onPick: (instanceId: string | undefined) => void = () => {};

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly dungeon: Dungeon,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.scene.background = new THREE.Color(0x14161c);
    this.scene.fog = new THREE.Fog(0x14161c, 30, 80);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(8, 14, 14);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI / 2.1; // never go under the floor
    this.controls.target.set(0, 0, 0);

    this.setupEnvironment();
    this.setupPicking();

    dungeon.subscribe((rooms) => this.sync(rooms));
    this.sync(dungeon.list());

    new ResizeObserver(() => this.resize()).observe(canvas);
    this.resize();
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }

  /** Called with the instanceId of the clicked room, or undefined for empty space. */
  setPickHandler(handler: (instanceId: string | undefined) => void): void {
    this.onPick = handler;
  }

  setSelected(instanceId: string | undefined): void {
    this.selectedId = instanceId;
    for (const [id, { obj }] of this.roomObjects) {
      obj.floorMaterial.emissive.copy(id === instanceId ? SELECTED_EMISSIVE : NO_EMISSIVE);
    }
  }

  private setupEnvironment(): void {
    this.scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x2a2018, 0.8));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(10, 20, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const s = 25;
    Object.assign(sun.shadow.camera, { left: -s, right: s, top: s, bottom: -s });
    this.scene.add(sun);

    const grid = new THREE.GridHelper(60, 60, 0x3a3f4b, 0x262a33);
    this.scene.add(grid);
  }

  private setupPicking(): void {
    // Distinguish a click from an orbit drag.
    let down: { x: number; y: number } | undefined;
    this.canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const rect = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      this.raycaster.setFromCamera(ndc, this.camera);
      const groups = [...this.roomObjects.values()].map((r) => r.obj.group);
      const hit = this.raycaster.intersectObjects(groups, true)[0];
      let id: string | undefined;
      for (let o: THREE.Object3D | null = hit?.object ?? null; o; o = o.parent) {
        if (typeof o.userData.instanceId === 'string') {
          id = o.userData.instanceId as string;
          break;
        }
      }
      this.onPick(id);
    });
  }

  private sync(rooms: readonly RoomInstance[]): void {
    const live = new Set(rooms.map((r) => r.instanceId));
    for (const [id, entry] of this.roomObjects) {
      if (!live.has(id)) this.removeObject(id, entry.obj);
    }
    for (const room of rooms) {
      const existing = this.roomObjects.get(room.instanceId);
      if (existing && existing.room === room) continue; // instances are immutable
      if (existing) this.removeObject(room.instanceId, existing.obj);
      const obj = buildRoomObject(room, this.dungeon.definitionOf(room));
      this.scene.add(obj.group);
      this.roomObjects.set(room.instanceId, { obj, room });
    }
    this.setSelected(this.selectedId && live.has(this.selectedId) ? this.selectedId : undefined);
  }

  private removeObject(id: string, obj: RoomObject): void {
    this.scene.remove(obj.group);
    disposeRoomObject(obj);
    this.roomObjects.delete(id);
  }

  private resize(): void {
    const { clientWidth: w, clientHeight: h } = this.canvas;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}
