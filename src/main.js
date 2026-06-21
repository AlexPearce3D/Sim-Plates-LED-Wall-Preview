import './styles.css';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { CarFront, MoveLeft, MoveRight, Rotate3D, createIcons } from 'lucide';

createIcons({ icons: { CarFront, MoveLeft, MoveRight, Rotate3D } });

const canvas = document.querySelector('#stageCanvas');
const assetInput = document.querySelector('#assetInput');
const dropZone = document.querySelector('#dropZone');
const assetList = document.querySelector('#assetList');
const assetStatus = document.querySelector('#assetStatus');
const wallArc = document.querySelector('#wallArc');
const brightness = document.querySelector('#brightness');
const rotation = document.querySelector('#rotation');
const carModelInput = document.querySelector('#carModelInput');
const carModelStatus = document.querySelector('#carModelStatus');
const resetCarModel = document.querySelector('#resetCarModel');
const showGrid = document.querySelector('#showGrid');
const clearAssets = document.querySelector('#clearAssets');

const publicUrl = (path) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, '')}`;
const FIRST_VIDEO = {
  id: 'first-360-video',
  name: 'SIM_260201_DR-D-RuralHighway03_Desert_WithTraffic_8k_h265_p3g24.mov',
  kind: 'Video',
  hevcUrl: import.meta.env.DEV ? '/media/first-360.mov' : null,
  previewUrl: publicUrl('/videos/first-360-preview.mp4'),
  preview: publicUrl('/posters/first-360.jpg'),
};
const DEFAULT_CAR_MODEL = {
  name: 'RealisticCar05 black paint',
  url: publicUrl('/models/realistic-car-05/RealisticCar05_HD_LOD0_black_parent_fixed.glb'),
};
const SCENE_BASIS_DEGREES = -90;
const SCENE_BASIS_RADIANS = THREE.MathUtils.degToRad(SCENE_BASIS_DEGREES);
const CAR_YAW_DEGREES = SCENE_BASIS_DEGREES + 180;

function rotateStagePoint(point) {
  return new THREE.Vector3(...point).applyAxisAngle(new THREE.Vector3(0, 1, 0), SCENE_BASIS_RADIANS);
}

function stagePosition(point) {
  const rotated = rotateStagePoint(point);
  return [rotated.x, rotated.y, rotated.z];
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const pmremGenerator = new THREE.PMREMGenerator(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080a);
const neutralEnvironment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = neutralEnvironment;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 180);
camera.position.copy(rotateStagePoint([0.15, 1.35, 3.2]));

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.copy(rotateStagePoint([0, 0.88, 0.1]));
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 1.35;
controls.maxDistance = 32;

scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x111319, 0.6));

const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(4, 7, 6);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 18;
scene.add(keyLight);

const fillLight = new THREE.PointLight(0x4fc3b1, 1.8, 18);
fillLight.position.set(-5, 3.2, 2);
scene.add(fillLight);

const carRimLight = new THREE.SpotLight(0xffffff, 5.2, 12, Math.PI * 0.22, 0.45, 1.2);
carRimLight.position.set(-3.8, 4.5, 3.8);
carRimLight.target.position.set(0, 0.65, 0);
scene.add(carRimLight);
scene.add(carRimLight.target);

let wallMesh;
let ceilingMesh;
let wallMaterial;
let activeAsset = null;
let activeTexture = makePresetTexture();
const loadedAssets = [];
let cameraTween = null;
const previewCameraProjection = new THREE.Vector3();

const wallVertexShader = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const wallFragmentShader = `
  #define PI 3.1415926535897932384626433832795

  uniform sampler2D map;
  uniform float brightness;
  uniform float rotation;
  uniform vec3 projectionCenter;
  varying vec3 vWorldPosition;

  void main() {
    vec3 direction = normalize(vWorldPosition - projectionCenter);
    float longitude = atan(direction.z, direction.x) + rotation;
    float latitude = asin(clamp(direction.y, -1.0, 1.0));
    vec2 sphericalUv = vec2(fract(0.5 + longitude / (2.0 * PI)), 0.5 + latitude / PI);
    vec4 texel = texture2D(map, sphericalUv);
    gl_FragColor = vec4(texel.rgb * brightness, texel.a);
  }
`;

const floorMaterial = new THREE.MeshStandardMaterial({
  color: 0x191d21,
  roughness: 0.72,
  metalness: 0.18,
});
const floor = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 7.9, 0.24, 96), floorMaterial);
floor.position.y = -0.12;
floor.receiveShadow = true;
scene.add(floor);

const turntableMaterial = new THREE.MeshStandardMaterial({
  color: 0x5d6366,
  roughness: 0.46,
  metalness: 0.12,
});
const turntable = new THREE.Mesh(new THREE.CylinderGeometry(2.9, 2.95, 0.08, 96), turntableMaterial);
turntable.position.y = 0.04;
turntable.receiveShadow = true;
scene.add(turntable);

const grid = new THREE.GridHelper(15, 30, 0x4fc3b1, 0x2e343d);
grid.position.y = 0.09;
scene.add(grid);

const wallGroup = new THREE.Group();
scene.add(wallGroup);
buildWall();

const carLoader = new GLTFLoader();
let carModelUrl = null;
let car = new THREE.Group();
car.name = 'LoadedCarSlot';
scene.add(car);

const reflectionTarget = new THREE.WebGLCubeRenderTarget(512, {
  generateMipmaps: true,
  minFilter: THREE.LinearMipmapLinearFilter,
  colorSpace: THREE.SRGBColorSpace,
});
const reflectionCamera = new THREE.CubeCamera(0.25, 80, reflectionTarget);
reflectionCamera.position.set(0, 0.95, 0);
scene.add(reflectionCamera);

const clock = new THREE.Clock();

function buildWall() {
  if (wallMesh) {
    wallMesh.geometry.dispose();
    wallGroup.remove(wallMesh);
  }
  if (ceilingMesh) {
    ceilingMesh.geometry.dispose();
    wallGroup.remove(ceilingMesh);
  }
  if (wallMaterial) wallMaterial.dispose();

  const arcDegrees = Number(wallArc.value);
  const arc = THREE.MathUtils.degToRad(arcDegrees);
  const openGap = Math.PI * 2 - arc;
  const start = Math.PI * 0.5 + openGap * 0.5;
  const radius = 7.15;
  const height = 4.2;
  const radialSegments = Math.max(48, Math.round(arcDegrees / 2));

  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    radialSegments,
    1,
    true,
    start,
    arc,
  );

  wallMaterial = new THREE.ShaderMaterial({
    uniforms: {
      map: { value: activeTexture },
      brightness: { value: Number(brightness.value) },
      rotation: { value: THREE.MathUtils.degToRad(Number(rotation.value)) },
      projectionCenter: { value: previewCameraProjection },
    },
    vertexShader: wallVertexShader,
    fragmentShader: wallFragmentShader,
    side: THREE.BackSide,
    toneMapped: false,
  });

  wallMesh = new THREE.Mesh(geometry, wallMaterial);
  wallMesh.name = 'ProjectedLedWall';
  wallMesh.position.y = height / 2;

  const ceilingGeometry = new THREE.CircleGeometry(radius, 128);
  ceilingGeometry.rotateX(-Math.PI / 2);
  ceilingMesh = new THREE.Mesh(ceilingGeometry, wallMaterial);
  ceilingMesh.name = 'ProjectedLedCeiling';
  ceilingMesh.position.y = height;

  wallGroup.add(wallMesh);
  wallGroup.add(ceilingMesh);
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.geometry?.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (
          value?.isTexture &&
          value !== activeTexture &&
          value !== neutralEnvironment &&
          value !== reflectionTarget.texture
        ) {
          value.dispose();
        }
      });
      material.dispose();
    });
  });
}

function installCar(nextCar) {
  scene.remove(car);
  disposeObject(car);
  car = nextCar;
  car.rotation.y = THREE.MathUtils.degToRad(CAR_YAW_DEGREES);
  applyCarReflectionEnvironment();
  scene.add(car);
}

function normalizeCarModel(model) {
  const wrapper = new THREE.Group();

  wrapper.add(model);

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const longestSide = Math.max(size.x, size.y, size.z);
  const targetLength = 4.25;
  const scale = longestSide > 0 ? targetLength / longestSide : 1;

  model.scale.setScalar(scale);

  const centeredBox = new THREE.Box3().setFromObject(model);
  const centeredCenter = centeredBox.getCenter(new THREE.Vector3());
  model.position.sub(centeredCenter);

  const scaledBox = new THREE.Box3().setFromObject(model);
  model.position.y -= scaledBox.min.y;

  wrapper.position.set(0, 0.11, 0);
  wrapper.traverse((child) => {
    if (!child.isMesh) return;
    child.frustumCulled = false;
    child.castShadow = true;
    child.receiveShadow = true;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      material.side = THREE.DoubleSide;
      tuneCarMaterialForReflections(material, child);
      material.needsUpdate = true;
    });
  });

  return wrapper;
}

function updateReflectionEnvironment() {
  scene.environment = neutralEnvironment;
  applyCarReflectionEnvironment();
}

function applyCarReflectionEnvironment() {
  if (!car) return;
  car.traverse((child) => {
    if (!child.isMesh) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (!material || !('envMap' in material)) return;
      material.envMap = reflectionTarget.texture;
      tuneCarMaterialForReflections(material, child);
      material.needsUpdate = true;
    });
  });
}

function tuneCarMaterialForReflections(material, mesh) {
  const materialLabel = `${material.name ?? ''} ${mesh.name ?? ''}`.toLowerCase();
  const isRubber = /tire|tyre|rubber/.test(materialLabel);

  if ('envMapIntensity' in material) material.envMapIntensity = isRubber ? 0.35 : 3.8;
  if ('roughness' in material) {
    const maxRoughness = isRubber ? 0.78 : 0.24;
    material.roughness = Math.min(material.roughness ?? maxRoughness, maxRoughness);
  }
  if ('clearcoat' in material && !isRubber) material.clearcoat = Math.max(material.clearcoat ?? 0, 0.72);
  if ('clearcoatRoughness' in material && !isRubber) {
    material.clearcoatRoughness = Math.min(material.clearcoatRoughness ?? 0.12, 0.12);
  }
}

function updateCarReflectionCapture() {
  if (!car || !wallMesh) return;
  const wasVisible = car.visible;
  car.visible = false;
  reflectionCamera.position.set(0, 0.95, 0);
  reflectionCamera.update(renderer, scene);
  car.visible = wasVisible;
}

function resetCarToStandIn() {
  if (carModelUrl) {
    URL.revokeObjectURL(carModelUrl);
    carModelUrl = null;
  }
  carModelStatus.textContent = 'Loading default car.';
  carModelInput.value = '';
  loadCarModelUrl(DEFAULT_CAR_MODEL.url, DEFAULT_CAR_MODEL.name);
}

function loadCarModelUrl(url, name) {
  carModelStatus.textContent = 'Loading model...';

  carLoader.load(
    url,
    (gltf) => {
      installCar(normalizeCarModel(gltf.scene));
      carModelStatus.textContent = name;
    },
    undefined,
    (error) => {
      console.error(error);
      carModelStatus.textContent = 'Could not load that model.';
    },
  );
}

function loadCarModel(file) {
  if (!file) return;
  if (carModelUrl) URL.revokeObjectURL(carModelUrl);
  carModelUrl = URL.createObjectURL(file);
  loadCarModelUrl(carModelUrl, file.name);
}

function makePresetTexture() {
  const size = 2048;
  const textureCanvas = document.createElement('canvas');
  textureCanvas.width = size;
  textureCanvas.height = size / 2;
  const ctx = textureCanvas.getContext('2d');
  const sky = ctx.createLinearGradient(0, 0, 0, textureCanvas.height);
  sky.addColorStop(0, '#143d59');
  sky.addColorStop(0.48, '#f6a35a');
  sky.addColorStop(0.5, '#2b3036');
  sky.addColorStop(1, '#090a0d');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, textureCanvas.width, textureCanvas.height);

  for (let i = 0; i < 28; i += 1) {
    const x = Math.random() * textureCanvas.width;
    const y = textureCanvas.height * (0.56 + Math.random() * 0.36);
    const w = 26 + Math.random() * 74;
    const h = 90 + Math.random() * 260;
    ctx.fillStyle = `rgba(${80 + Math.random() * 80}, ${120 + Math.random() * 90}, ${
      150 + Math.random() * 85
    }, 0.55)`;
    ctx.fillRect(x, y - h, w, h);
    ctx.fillStyle = 'rgba(255, 206, 92, 0.75)';
    for (let row = 0; row < h / 22; row += 1) {
      for (let col = 0; col < w / 16; col += 1) {
        if (Math.random() > 0.55) ctx.fillRect(x + col * 16 + 4, y - h + row * 22 + 6, 5, 4);
      }
    }
  }

  ctx.fillStyle = 'rgba(79, 195, 177, 0.42)';
  for (let x = 0; x < textureCanvas.width; x += 92) {
    ctx.fillRect(x, textureCanvas.height * 0.5, 2, textureCanvas.height * 0.5);
  }

  const texture = new THREE.CanvasTexture(textureCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function setWallTexture(texture, asset = null) {
  activeTexture = texture;
  activeAsset = asset;
  activeTexture.colorSpace = THREE.SRGBColorSpace;
  activeTexture.wrapS = THREE.RepeatWrapping;
  activeTexture.wrapT = THREE.ClampToEdgeWrapping;
  if (wallMaterial) {
    wallMaterial.uniforms.map.value = activeTexture;
    wallMaterial.needsUpdate = true;
  }
  updateReflectionEnvironment();
  assetStatus.textContent = asset ? (asset.statusLabel ?? asset.kind) : 'Preset';
  renderAssetList();
}

function canPlayHevc(video) {
  return Boolean(
    video.canPlayType('video/quicktime; codecs="hvc1"') ||
      video.canPlayType('video/mp4; codecs="hvc1"') ||
      video.canPlayType('video/mp4; codecs="hev1"'),
  );
}

function makeVideoTexture(video) {
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makePosterTexture(url) {
  const texture = new THREE.TextureLoader().load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

function makeInitialVideoAsset() {
  const video = document.createElement('video');
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  const codecSupported = canPlayHevc(video);
  video.src = codecSupported && FIRST_VIDEO.hevcUrl ? FIRST_VIDEO.hevcUrl : FIRST_VIDEO.previewUrl;

  return {
    ...FIRST_VIDEO,
    url: video.src,
    statusLabel: 'Video',
    meta: codecSupported ? '8K HEVC' : 'H.264 preview',
    video,
    texture: makeVideoTexture(video),
  };
}

function addFiles(files) {
  [...files]
    .filter((file) => file.type.startsWith('image/') || file.type.startsWith('video/'))
    .forEach((file) => {
      const url = URL.createObjectURL(file);
      const asset = {
        id: crypto.randomUUID(),
        name: file.name,
        kind: file.type.startsWith('video/') ? 'Video' : 'Image',
        url,
        objectUrl: true,
        texture: null,
      };

      if (asset.kind === 'Video') {
        const video = document.createElement('video');
        video.src = url;
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.crossOrigin = 'anonymous';
        asset.preview = url;
        asset.video = video;
        asset.texture = makeVideoTexture(video);
      } else {
        asset.preview = url;
        asset.texture = makePosterTexture(url);
      }

      loadedAssets.push(asset);
    });

  if (loadedAssets.length && !activeAsset) activateAsset(loadedAssets[0]);
  renderAssetList();
}

function activateAsset(asset) {
  loadedAssets.forEach((item) => {
    if (item.video && item !== asset) item.video.pause();
  });
  if (asset.video) asset.video.play().catch(() => {});
  setWallTexture(asset.texture, asset);
}

function renderAssetList() {
  assetList.innerHTML = '';

  if (!loadedAssets.length) {
    const empty = document.createElement('div');
    empty.className = 'asset-meta';
    empty.textContent = 'No files loaded yet. The generated city preset is active.';
    assetList.append(empty);
    return;
  }

  loadedAssets.forEach((asset) => {
    const button = document.createElement('button');
    button.className = `asset-button${activeAsset?.id === asset.id ? ' is-active' : ''}`;
    button.type = 'button';
    button.addEventListener('click', () => activateAsset(asset));

    const media = asset.kind === 'Video' ? document.createElement('video') : document.createElement('img');
    media.className = 'asset-thumb';
    media.src = asset.preview;
    media.muted = true;

    const copy = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'asset-name';
    name.textContent = asset.name;
    const meta = document.createElement('div');
    meta.className = 'asset-meta';
    meta.textContent = asset.meta ?? asset.kind;
    copy.append(name, meta);

    button.append(media, copy);
    assetList.append(button);
  });
}

function setCameraView(view) {
  const views = {
    front: {
      position: [0.1, 1.32, 3.15],
      target: [0, 0.88, 0.12],
    },
    left: {
      position: [-3.25, 1.35, 0.25],
      target: [0, 0.82, 0.05],
    },
    right: {
      position: [3.25, 1.35, 0.25],
      target: [0, 0.82, 0.05],
    },
    back: {
      position: [0.05, 1.28, -3.05],
      target: [0, 0.92, -0.1],
    },
  };
  const next = views[view];
  if (!next) return;
  startCameraTween(stagePosition(next.position), stagePosition(next.target));
}

function startCameraTween(position, target) {
  cameraTween = {
    elapsed: 0,
    duration: 0.85,
    fromPosition: camera.position.clone(),
    toPosition: new THREE.Vector3(...position),
    fromTarget: controls.target.clone(),
    toTarget: new THREE.Vector3(...target),
  };
}

function updateCameraTween(delta) {
  if (!cameraTween) return;
  cameraTween.elapsed = Math.min(cameraTween.duration, cameraTween.elapsed + delta);
  const linearT = cameraTween.elapsed / cameraTween.duration;
  const t = linearT * linearT * (3 - 2 * linearT);

  camera.position.lerpVectors(cameraTween.fromPosition, cameraTween.toPosition, t);
  controls.target.lerpVectors(cameraTween.fromTarget, cameraTween.toTarget, t);

  if (linearT >= 1) {
    cameraTween = null;
  }
}

assetInput.addEventListener('change', (event) => addFiles(event.target.files));

['dragenter', 'dragover'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add('is-over');
  });
});

['dragleave', 'drop'].forEach((eventName) => {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove('is-over');
  });
});

dropZone.addEventListener('drop', (event) => addFiles(event.dataTransfer.files));

wallArc.addEventListener('input', buildWall);
brightness.addEventListener('input', () => {
  if (wallMaterial) wallMaterial.uniforms.brightness.value = Number(brightness.value);
});
rotation.addEventListener('input', () => {
  if (wallMaterial) wallMaterial.uniforms.rotation.value = THREE.MathUtils.degToRad(Number(rotation.value));
});
carModelInput.addEventListener('change', (event) => loadCarModel(event.target.files[0]));
resetCarModel.addEventListener('click', resetCarToStandIn);
showGrid.addEventListener('change', () => {
  grid.visible = showGrid.checked;
});
clearAssets.addEventListener('click', () => {
  loadedAssets.forEach((asset) => {
    if (asset.video) asset.video.pause();
    if (asset.objectUrl) URL.revokeObjectURL(asset.url);
  });
  loadedAssets.length = 0;
  setWallTexture(makePresetTexture());
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => setCameraView(button.dataset.view));
});

function resize() {
  const { clientWidth, clientHeight } = canvas;
  const needsResize = canvas.width !== clientWidth || canvas.height !== clientHeight;
  if (needsResize) {
    renderer.setSize(clientWidth, clientHeight, false);
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
}

function animate() {
  const delta = clock.getDelta();
  resize();
  updateCameraTween(delta);
  controls.update();
  camera.getWorldPosition(previewCameraProjection);
  if (wallMaterial) {
    wallMaterial.uniforms.projectionCenter.value.copy(previewCameraProjection);
  }
  updateCarReflectionCapture();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

loadedAssets.push(makeInitialVideoAsset());
activateAsset(loadedAssets[0]);
loadCarModelUrl(DEFAULT_CAR_MODEL.url, DEFAULT_CAR_MODEL.name);
animate();

window.ledStagePreview = {
  scene,
  camera,
  renderer,
  loadedAssets,
  get activeVideo() {
    return activeAsset?.video ?? null;
  },
};
