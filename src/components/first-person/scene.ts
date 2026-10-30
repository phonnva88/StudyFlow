import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {
  ROOM_SPACE_EYE_HEIGHT, ROOM_SPACE_PUNCH_REACH,
  ROOM_SPACE_SEATS, roomSpaceCanStand,
} from '@/lib/room-space';

export interface FirstPersonBridge {
  local: {x: number; z: number; yaw: number; seat: number | null};
  snapshot: {players: {identity: string; name: string; x: number; z: number; yaw: number; seat: number | null; updatedAt: number}[]};
  identity: string;
  enabled: boolean;
  interact: (target: {seat?: number; target?: string}) => void;
}
export interface FirstPersonHandle {
  dispose(): void;
  setMove(forward: number, right: number): void;
  interact(kind: 'seat' | 'punch'): void;
}
export type LibraryModelStatus = 'loading' | 'loaded' | 'missing';

// This module is imported only after the browser mounts the first-person canvas.
export function createFirstPerson(
  parent: HTMLElement,
  bridge: FirstPersonBridge,
  onReady: () => void,
  onError: (message: string) => void,
  onModelStatus: (status: LibraryModelStatus) => void,
): FirstPersonHandle {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({antialias: true, powerPreference: 'high-performance'});
  } catch {
    throw new Error('This browser cannot open the 3D view. Enable graphics acceleration or use the grid view.');
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x192a29);
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', 'First-person study library. WASD or arrow keys to move; E to sit or stand; F to punch a nearby seated participant. Escape releases the mouse.');
  canvas.style.display = 'block'; canvas.style.width = '100%'; canvas.style.height = '100%'; canvas.style.touchAction = 'none';
  parent.appendChild(canvas);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x233331);
  scene.fog = new THREE.Fog(0x233331, 15, 36);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.06, 70);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  scene.add(new THREE.HemisphereLight(0xffefce, 0x536a64, 2.4));
  const sunlight = new THREE.DirectionalLight(0xffe7bd, 2.5);
  sunlight.position.set(-4, 6, 3); scene.add(sunlight);
  const ambient = new THREE.AmbientLight(0xffffff, 0.3); scene.add(ambient);

  const materials = new Set<THREE.Material>();
  const geometries = new Set<THREE.BufferGeometry>();
  const textures = new Set<THREE.Texture>();
  const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
    const material = new THREE.MeshStandardMaterial({color, roughness: 0.8, ...extra}); materials.add(material); return material;
  };
  const wood = mat(0xb98b5e), darkWood = mat(0x4e3c30), oak = mat(0xd4ac79), green = mat(0x4c6960), cream = mat(0xe1d9bd);
  const metal = mat(0x3d4543, {roughness: 0.4, metalness: 0.5});
  const paper = mat(0xeee2bd), lamp = mat(0xe6bd74, {emissive: 0xffce79, emissiveIntensity: 0.7});
  const box = (owner: THREE.Object3D, x: number, y: number, z: number, w: number, h: number, d: number, material: THREE.Material) => {
    const geometry = new THREE.BoxGeometry(w, h, d); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); owner.add(mesh); return mesh;
  };
  const cylinder = (owner: THREE.Object3D, x: number, y: number, z: number, radius: number, height: number, material: THREE.Material) => {
    const geometry = new THREE.CylinderGeometry(radius, radius, height, 12); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); owner.add(mesh); return mesh;
  };
  const sphere = (owner: THREE.Object3D, x: number, y: number, z: number, radius: number, material: THREE.Material) => {
    const geometry = new THREE.SphereGeometry(radius, 16, 12); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); owner.add(mesh); return mesh;
  };
  const label = (text: string, width = 256) => {
    const image = document.createElement('canvas'); image.width = width; image.height = 64;
    const context = image.getContext('2d')!;
    context.fillStyle = '#20342de6'; context.fillRect(0, 0, width, 64);
    context.fillStyle = '#fff4d6'; context.font = '600 25px sans-serif'; context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, width / 2, 32, width - 16);
    const texture = new THREE.CanvasTexture(image); texture.colorSpace = THREE.SRGBColorSpace; textures.add(texture);
    const material = new THREE.SpriteMaterial({map: texture, depthWrite: false}); materials.add(material);
    const sprite = new THREE.Sprite(material); sprite.scale.set(1.3, 0.325, 1); return sprite;
  };

  const architecture = new THREE.Group(); scene.add(architecture);
  const floorCanvas = document.createElement('canvas'); floorCanvas.width = 512; floorCanvas.height = 512;
  const floorContext = floorCanvas.getContext('2d')!;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
    const offset = y % 2 ? 64 : 0;
    floorContext.fillStyle = ['#ae845b', '#ba946b', '#a97b53', '#c19b72'][(x + y) % 4];
    floorContext.fillRect(x * 128 - offset, y * 64, 127, 63);
    if (x === 0 && offset) floorContext.fillRect(448, y * 64, 64, 63);
    floorContext.fillStyle = '#805c3e55'; floorContext.fillRect(x * 128 - offset + 14, y * 64 + 26, 87, 1);
  }
  const floorTexture = new THREE.CanvasTexture(floorCanvas); floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping; floorTexture.repeat.set(4, 3); floorTexture.colorSpace = THREE.SRGBColorSpace; textures.add(floorTexture);
  const floorMaterial = mat(0xffffff, {map: floorTexture});
  box(scene, 0, -0.06, 0, 14, 0.12, 10, floorMaterial);
  box(architecture, 0, 1.8, -5, 14.2, 3.6, 0.14, cream);
  box(architecture, -7, 1.8, 0, 0.14, 3.6, 10, cream);
  box(architecture, 7, 1.8, 0, 0.14, 3.6, 10, cream);
  box(architecture, -4, 1.8, 5, 6, 3.6, 0.14, green);
  box(architecture, 4, 1.8, 5, 6, 3.6, 0.14, green);
  box(architecture, 0, 3.25, 5, 2.2, 0.7, 0.14, green);
  box(architecture, 0, 3.6, 0, 14, 0.12, 10, cream);
  for (const x of [-7, 7]) {
    box(architecture, x * 0.998, 0.55, 0, 0.16, 1.1, 10, green);
    box(architecture, x * 0.994, 1.13, 0, 0.19, 0.06, 10, darkWood);
    box(architecture, x * 0.994, 0.08, 0, 0.19, 0.16, 10, darkWood);
  }
  for (const z of [-3.5, 0, 3.5]) box(architecture, 0, 3.39, z, 14, 0.22, 0.18, darkWood);
  const glass = mat(0xaac5c2, {emissive: 0x6a9292, emissiveIntensity: 0.45, roughness: 0.15});
  for (const z of [-2.8, 1.3]) {
    box(architecture, -6.88, 2.15, z, 0.06, 1.65, 2.5, darkWood);
    box(architecture, -6.83, 2.15, z, 0.06, 1.45, 2.28, glass);
    box(architecture, -6.77, 2.15, z, 0.06, 0.06, 2.3, cream);
    box(architecture, -6.77, 2.15, z, 0.06, 1.45, 0.06, cream);
  }
  // Rear shelves match the authoritative obstacle so walking and hits agree.
  box(architecture, 0, 1.4, -4.55, 13, 2.8, 0.7, darkWood);
  const bookMats = [mat(0x748d7e), mat(0xa96951), mat(0xd2b278), mat(0x75869a), mat(0x97749b)];
  for (let row = 0; row < 4; row++) {
    box(architecture, 0, 0.15 + row * 0.65, -4.13, 13, 0.08, 0.11, oak);
    for (let n = 0; n < 54; n++) {
      const height = 0.36 + (n % 4) * 0.045;
      box(architecture, -6.2 + n * 0.235, 0.19 + row * 0.65 + height / 2, -4.2, 0.16 + (n % 2) * 0.03, height, 0.27, bookMats[(n + row) % bookMats.length]);
    }
  }
  for (const x of [-6.4, 6.4]) for (const z of [-3.4, 4.2]) {
    cylinder(architecture, x, 0.25, z, 0.25, 0.5, mat(0xb17d59));
    cylinder(architecture, x, 0.7, z, 0.035, 0.75, darkWood);
    for (let n = 0; n < 5; n++) sphere(architecture, x + Math.sin(n * 2) * 0.18, 1 + (n % 2) * 0.15, z + Math.cos(n * 2) * 0.18, 0.22, green);
  }
  const ceilingLight = mat(0xffe4a2, {emissive: 0xffd381, emissiveIntensity: 1.1});
  for (const x of [-4, 0, 4]) {
    cylinder(architecture, x, 3.14, 0, 0.025, 0.7, metal);
    const geometry = new THREE.ConeGeometry(0.42, 0.3, 20, 1, true); geometries.add(geometry);
    const shade = new THREE.Mesh(geometry, green); shade.rotation.x = Math.PI; shade.position.set(x, 2.82, 0); architecture.add(shade);
    sphere(architecture, x, 2.75, 0, 0.11, ceilingLight);
    const light = new THREE.PointLight(0xffdda0, 14, 7, 2); light.position.set(x, 2.6, 0); architecture.add(light);
  }
  const entranceSign = label('STUDYFLOW · LIBRARY', 512); entranceSign.position.set(0, 2.65, 4.8); entranceSign.scale.set(2.4, 0.3, 1); architecture.add(entranceSign);

  const furnishings = new THREE.Group(); scene.add(furnishings);
  const interactives: THREE.Object3D[] = [];
  ROOM_SPACE_SEATS.forEach((seat, index) => {
    const z = seat.z - 0.9;
    box(furnishings, seat.x, 0.79, z, 2.2, 0.12, 0.9, oak);
    for (const dx of [-0.92, 0.92]) for (const dz of [-0.32, 0.32]) box(furnishings, seat.x + dx, 0.38, z + dz, 0.075, 0.76, 0.075, metal);
    box(furnishings, seat.x - 0.27, 0.863, z + 0.03, 0.5, 0.018, 0.34, paper);
    box(furnishings, seat.x - 0.27, 0.875, z + 0.03, 0.006, 0.018, 0.34, wood);
    box(furnishings, seat.x + 0.48, 0.87, z - 0.05, 0.38, 0.05, 0.3, bookMats[index % bookMats.length]);
    cylinder(furnishings, seat.x + 0.82, 0.88, z - 0.17, 0.1, 0.07, metal);
    cylinder(furnishings, seat.x + 0.82, 1.1, z - 0.17, 0.018, 0.42, metal);
    sphere(furnishings, seat.x + 0.82, 1.31, z - 0.17, 0.12, lamp);
    const chair = new THREE.Group(); chair.userData.seat = index;
    box(chair, 0, 0.44, 0, 0.52, 0.1, 0.5, green);
    box(chair, 0, 0.78, 0.23, 0.52, 0.68, 0.08, green);
    for (const dx of [-0.2, 0.2]) for (const dz of [-0.18, 0.18]) box(chair, dx, 0.2, dz, 0.055, 0.4, 0.055, darkWood);
    chair.position.set(seat.x, 0, seat.z); furnishings.add(chair); interactives.push(chair);
    const sign = label(`Seat ${index + 1}`); sign.position.set(seat.x, 1.05, z - 0.08); sign.scale.set(0.7, 0.175, 1); furnishings.add(sign);
  });

  const avatars = new Map<string, THREE.Group>();
  const skin = mat(0xd9aa84), hair = mat(0x47382e), pants = mat(0x3a454e);
  function createAvatar(identity: string, name: string) {
    const group = new THREE.Group(); group.userData.target = identity;
    const hash = [...identity].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 0);
    const shirt = mat([0x7fa998, 0xa799b6, 0xb58b66, 0x879fb6, 0xb4777d][hash % 5]);
    cylinder(group, 0, 1.1, 0, 0.22, 0.62, shirt);
    sphere(group, 0, 1.59, 0, 0.2, skin);
    sphere(group, 0, 1.71, 0.025, 0.17, hair);
    for (const x of [-0.3, 0.3]) cylinder(group, x, 1.06, 0, 0.065, 0.53, shirt);
    for (const x of [-0.11, 0.11]) cylinder(group, x, 0.43, 0, 0.085, 0.75, pants);
    const sign = label(name); sign.position.set(0, 2.05, 0); group.add(sign);
    group.userData.ownedMaterials = new Set([shirt, sign.material]);
    scene.add(group); interactives.push(group); return group;
  }
  const hand = new THREE.Group(); camera.add(hand);
  sphere(hand, 0.27, -0.25, -0.43, 0.075, skin);
  const sleeve = cylinder(hand, 0.3, -0.39, -0.28, 0.064, 0.3, green); sleeve.rotation.x = -0.7;
  hand.visible = false;

  let disposed = false, failed = false, frame = 0, previous = performance.now(), pitch = 0;
  let virtualForward = 0, virtualRight = 0, punchUntil = 0, ready = false;
  const keys = new Set<string>();
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const pointerTouch = {id: -1, x: 0, y: 0, moved: false};
  const typing = () => !!document.activeElement?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]');
  const focused = () => document.pointerLockElement === canvas || document.activeElement === canvas;
  function actionable(fromPointer?: {x: number; y: number}) {
    if (fromPointer) { const rect = canvas.getBoundingClientRect(); pointer.set((fromPointer.x - rect.left) / rect.width * 2 - 1, -(fromPointer.y - rect.top) / rect.height * 2 + 1); }
    else pointer.set(0, 0);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(interactives, true).find(hit => hit.distance < 3.1);
    if (!hit) return null;
    let object: THREE.Object3D | null = hit.object;
    while (object && object !== scene) {
      if (typeof object.userData.seat === 'number') return {seat: object.userData.seat as number};
      if (typeof object.userData.target === 'string') return {target: object.userData.target as string};
      object = object.parent;
    }
    return null;
  }
  function interact(kind: 'seat' | 'punch') {
    if (!bridge.enabled || document.hidden || typing()) return;
    const local = bridge.local;
    if (kind === 'seat') {
      if (local.seat !== null) { bridge.interact({}); return; }
      const hit = actionable();
      if (hit && 'seat' in hit) { bridge.interact(hit); return; }
      let nearest = -1, distance = 1.8;
      ROOM_SPACE_SEATS.forEach((seat, index) => {
        const d = Math.hypot(local.x - seat.x, local.z - seat.z);
        if (d < distance && !bridge.snapshot.players.some(p => p.seat === index)) { distance = d; nearest = index; }
      });
      if (nearest >= 0) bridge.interact({seat: nearest});
    } else {
      const hit = actionable();
      const target = hit && 'target' in hit ? bridge.snapshot.players.find(p => p.identity === hit.target) :
        bridge.snapshot.players.filter(p => p.identity !== bridge.identity && p.seat !== null).filter(p => {
          const dx = p.x - local.x, dz = p.z - local.z, distance = Math.hypot(dx, dz);
          return distance <= ROOM_SPACE_PUNCH_REACH && (-Math.sin(local.yaw) * dx - Math.cos(local.yaw) * dz) / Math.max(distance, 0.01) > 0.4;
        }).sort((a, b) => Math.hypot(a.x - local.x, a.z - local.z) - Math.hypot(b.x - local.x, b.z - local.z))[0];
      if (target && target.identity !== bridge.identity && target.seat !== null && Math.hypot(target.x - local.x, target.z - local.z) <= ROOM_SPACE_PUNCH_REACH) {
        punchUntil = performance.now() + 260; bridge.interact({target: target.identity});
      }
    }
  }
  function release() { keys.clear(); virtualForward = virtualRight = 0; if (document.pointerLockElement === canvas) document.exitPointerLock(); }
  function keydown(event: KeyboardEvent) {
    if (!bridge.enabled || !focused() || typing()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'Space'].includes(event.code)) event.preventDefault();
    keys.add(event.code);
    if (!event.repeat && event.code === 'KeyE') interact('seat');
    if (!event.repeat && event.code === 'KeyF') interact('punch');
  }
  function keyup(event: KeyboardEvent) { keys.delete(event.code); }
  function look(dx: number, dy: number) { if (!bridge.enabled || document.hidden) return; bridge.local.yaw = THREE.MathUtils.euclideanModulo(bridge.local.yaw - dx * 0.0027 + Math.PI, Math.PI * 2) - Math.PI; pitch = THREE.MathUtils.clamp(pitch - dy * 0.0027, -1.2, 1.15); }
  function mousemove(event: MouseEvent) { if (document.pointerLockElement === canvas && bridge.enabled) look(event.movementX, event.movementY); }
  function down(event: PointerEvent) {
    if (!bridge.enabled || event.button > 0) return;
    canvas.focus({preventScroll: true});
    if (event.pointerType === 'touch') { pointerTouch.id = event.pointerId; pointerTouch.x = event.clientX; pointerTouch.y = event.clientY; pointerTouch.moved = false; canvas.setPointerCapture(event.pointerId); }
    else if (document.pointerLockElement === canvas) interact('punch');
    else if (canvas.requestPointerLock) {
      const result = canvas.requestPointerLock(); if (result && typeof result.catch === 'function') void result.catch(() => {});
    }
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointerTouch.id) return;
    const dx = event.clientX - pointerTouch.x, dy = event.clientY - pointerTouch.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) pointerTouch.moved = true;
    look(dx * 1.5, dy * 1.5); pointerTouch.x = event.clientX; pointerTouch.y = event.clientY;
  }
  function up(event: PointerEvent) {
    if (event.pointerId !== pointerTouch.id) return;
    if (!pointerTouch.moved && bridge.enabled) { const hit = actionable({x: event.clientX, y: event.clientY}); if (hit) bridge.interact(hit); }
    pointerTouch.id = -1;
  }
  function visibility() { if (document.hidden) release(); }
  function lost(event: Event) { event.preventDefault(); if (!disposed) { failed = true; release(); onError('The browser lost its graphics connection. Reload the 3D view or switch to the grid.'); } }
  function resize() {
    if (disposed || failed) return;
    const width = Math.max(parent.clientWidth, 1), height = Math.max(parent.clientHeight, 1);
    camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
  }
  canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move); canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('webglcontextlost', lost);
  window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('mousemove', mousemove); window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', visibility);
  const observer = new ResizeObserver(resize); observer.observe(parent); resize();

  let imported: THREE.Object3D | null = null;
  const modelRequest = new AbortController();
  onModelStatus('loading');
  void fetch('/models/library/library.glb', {signal: AbortSignal.any([modelRequest.signal, AbortSignal.timeout(20000)])}).then(async response => {
    if (!response.ok) throw new Error('Model unavailable');
    const loader = new GLTFLoader();
    const model = await loader.parseAsync(await response.arrayBuffer(), '/models/library/');
    if (disposed) { disposeObject(model.scene); return; }
    const bounds = new THREE.Box3().setFromObject(model.scene), size = bounds.getSize(new THREE.Vector3());
    if (![size.x, size.y, size.z].every(n => Number.isFinite(n) && n > 0)) { disposeObject(model.scene); throw new Error('Invalid library model'); }
    const scale = Math.min(13.4 / size.x, 9.4 / size.z, 3.5 / size.y);
    model.scene.scale.multiplyScalar(scale);
    const aligned = new THREE.Box3().setFromObject(model.scene), center = aligned.getCenter(new THREE.Vector3());
    model.scene.position.x -= center.x; model.scene.position.z -= center.z; model.scene.position.y -= aligned.min.y;
    imported = model.scene; scene.add(imported); architecture.visible = false; onModelStatus('loaded');
  }).catch(() => { if (!disposed) onModelStatus('missing'); });
  function disposeObject(object: THREE.Object3D) {
    object.traverse(child => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose();
      const owned = mesh.material ? Array.isArray(mesh.material) ? mesh.material : [mesh.material] : [];
      for (const material of owned) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) value.dispose(); material.dispose(); }
    });
  }
  function disposeAvatar(avatar: THREE.Group) {
    avatar.traverse(child => {
      if (child instanceof THREE.Mesh) { geometries.delete(child.geometry); child.geometry.dispose(); }
    });
    const owned = avatar.userData.ownedMaterials as Set<THREE.Material>;
    for (const material of owned) {
      if (material instanceof THREE.SpriteMaterial && material.map) { textures.delete(material.map); material.map.dispose(); }
      materials.delete(material); material.dispose();
    }
  }

  function update(now: number) {
    if (disposed || failed) return;
    frame = requestAnimationFrame(update);
    const delta = Math.min((now - previous) / 1000, 0.05); previous = now;
    if (document.hidden) { keys.clear(); return; }
    const local = bridge.local;
    if (!bridge.enabled) release();
    if (bridge.enabled && !typing() && local.seat === null) {
      const forward = virtualForward + (focused() ? Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')) : 0);
      const right = virtualRight + (focused() ? Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')) : 0);
      const magnitude = Math.hypot(forward, right);
      if (magnitude > 0) {
        const step = 3 * delta / Math.max(magnitude, 1);
        const dx = (-Math.sin(local.yaw) * forward + Math.cos(local.yaw) * right) * step;
        const dz = (-Math.cos(local.yaw) * forward - Math.sin(local.yaw) * right) * step;
        if (roomSpaceCanStand(local.x + dx, local.z)) local.x += dx;
        if (roomSpaceCanStand(local.x, local.z + dz)) local.z += dz;
      }
    }
    camera.position.set(local.x, local.seat === null ? ROOM_SPACE_EYE_HEIGHT : 1.24, local.z);
    camera.rotation.set(pitch, local.yaw, 0);
    hand.visible = punchUntil > now;
    hand.position.z = hand.visible ? -Math.sin((punchUntil - now) / 260 * Math.PI) * 0.22 : 0;
    const present = new Set<string>();
    for (const player of bridge.snapshot.players) {
      if (player.identity === bridge.identity) continue;
      present.add(player.identity);
      let avatar = avatars.get(player.identity);
      if (!avatar) { avatar = createAvatar(player.identity, player.name); avatar.position.set(player.x, 0, player.z); avatars.set(player.identity, avatar); }
      const blend = 1 - Math.exp(-delta * 12);
      avatar.position.x += (player.x - avatar.position.x) * blend; avatar.position.z += (player.z - avatar.position.z) * blend;
      avatar.position.y += ((player.seat === null ? 0 : -0.42) - avatar.position.y) * blend;
      avatar.rotation.y += THREE.MathUtils.euclideanModulo(player.yaw - avatar.rotation.y + Math.PI, Math.PI * 2) - Math.PI;
    }
    for (const [identity, avatar] of avatars) if (!present.has(identity)) { scene.remove(avatar); interactives.splice(interactives.indexOf(avatar), 1); disposeAvatar(avatar); avatars.delete(identity); }
    try {
      renderer.render(scene, camera);
      if (!ready) { ready = true; onReady(); }
    } catch { failed = true; release(); onError('The 3D library could not be drawn. Reload this view or use the grid.'); }
  }
  frame = requestAnimationFrame(update);
  return {
    setMove(forward, right) { virtualForward = forward; virtualRight = right; },
    interact,
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(frame); release(); observer.disconnect(); modelRequest.abort();
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move); canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up); canvas.removeEventListener('webglcontextlost', lost);
      window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('mousemove', mousemove); window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', visibility);
      if (imported) disposeObject(imported);
      for (const geometry of geometries) geometry.dispose(); for (const material of materials) material.dispose(); for (const texture of textures) texture.dispose();
      renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
    },
  };
}
