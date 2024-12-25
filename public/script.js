document.addEventListener('DOMContentLoaded', () => {
    const projectId = 'your-current-project-id'; // Замените на ваш ID проекта, если нужно
    const visualizationParams = {
        animationSpeed: 0.1,
        minOpacity: 1.0,
        maxOpacity: 1.0,
        minColumnDepth: 1,
        maxColumnDepth: 260,
        maxDB: 130
    };
    const GRID_WIDTH = 130;
    const GRID_HEIGHT = 260;
    const GRID_DEPTH = 130;
    const CELL_SIZE = 1;
    const SPHERE_RADIUS = 5;
    const INITIAL_SCALE = 1.2;
    const ROTATION_LIMIT = THREE.MathUtils.degToRad(70);
    const SCALE_FACTOR = 0.005;

    const semitones = Array.from({ length: 130 }, (_, i) => ({
        deg: i,
        f: 27.5 * Math.pow(2, i / 12)
    }));

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(
        -window.innerWidth / 2,
        window.innerWidth / 2,
        window.innerHeight / 2,
        -window.innerHeight / 2,
        -10000,
        10000
    );
    camera.position.set(0, 600, 1600);
    camera.lookAt(0, 0, 0);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance", alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.getElementById('grid-container').appendChild(renderer.domElement);
    const labelMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
    let isXRMode = false;
    let videoStream = null;
    let videoElement = null;
    let startOffset = 0;
    let startTimestamp = 0;
    let audioContext = null;
    let audioBufferSource = null;
    let isPlaying = false;
    let pauseTime = 0;
    let referenceAmplitude = 1;
    let analyserLeft, analyserRight;
    const columns = [];
    const timelineContainer = document.getElementById('timeline-container');
    const timelineCanvas = document.getElementById('timeline-canvas');
    const playhead = document.getElementById('playhead');
    const cameraView = document.getElementById('camera-view');
    const ctx = timelineCanvas.getContext('2d');

    let timelineWidth = timelineContainer.clientWidth;
    let timelineHeight = timelineContainer.clientHeight;
    timelineCanvas.width = timelineWidth;
    timelineCanvas.height = timelineHeight;
    let hologramWidth = GRID_WIDTH * 2 * INITIAL_SCALE;
    let scaleFactor = timelineWidth / hologramWidth * 0.9;
    const mainSequencerGroup = new THREE.Group();
    mainSequencerGroup.scale.set(INITIAL_SCALE * scaleFactor, INITIAL_SCALE * scaleFactor, INITIAL_SCALE * scaleFactor);
    scene.add(mainSequencerGroup);
    renderer.autoClear = false;

    const defaultMaterial = new THREE.LineBasicMaterial({
        color: 0xffffff,
        opacity: 0.001,
        transparent: true,
        depthWrite: false,
        depthTest: false
    });

    function createSphere(color, radius) {
        const geometry = new THREE.SphereGeometry(radius * 0.5, 32, 32);
        const material = new THREE.MeshBasicMaterial({ color, depthTest: false });
        return new THREE.Mesh(geometry, material);
    }

    function createLine(start, end, color, opacity) {
        const material = new THREE.LineBasicMaterial({ color, opacity, transparent: true, depthTest: false });
        const geometry = new THREE.BufferGeometry().setFromPoints([start, end]);
        return new THREE.Line(geometry, material);
    }

    function createGrid(gridWidth, gridHeight, gridDepth, cellSize, color) {
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        for (let y = 0; y <= gridHeight; y += 1) {
            for (let z = 0; z <= gridDepth; z += 1) {
                positions.push(0, y * cellSize, z * cellSize, gridWidth * cellSize, y * cellSize, z * cellSize);
            }
        }
        for (let x = 0; x <= gridWidth; x += 1) {
            for (let z = 0; z <= gridDepth; z += 1) {
                positions.push(x * cellSize, 0, z * cellSize, x * cellSize, gridHeight * cellSize, z * cellSize);
            }
        }
        for (let z = 0; z <= gridWidth; z += 1) {
            for (let y = 0; y <= gridHeight; y += 1) {
                positions.push(z * cellSize, y * cellSize, 0, z * cellSize, y * cellSize, gridDepth * cellSize);
            }
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        const material = new THREE.LineBasicMaterial({
            color,
            opacity: 0.003,
            transparent: true,
            depthWrite: false,
            depthTest: false
        });
        return new THREE.LineSegments(geometry, material);
    }

    function createAxis(length, sphereRadius, xColor, yColor, zColor, isLeftGrid) {
        const axisGroup = new THREE.Group();
        const xAxisOffset = isLeftGrid ? GRID_WIDTH : 0;

        const xAxisGroup = new THREE.Group();
        axisGroup.add(xAxisGroup);
        const xAxis = createSphere(xColor, sphereRadius);
        xAxis.position.set(length, 0, 0);
        if (isLeftGrid) xAxis.position.x *= -1;
        xAxisGroup.add(xAxis);
        const xAxisLine = createLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0), xColor, visualizationParams.maxOpacity);
        xAxisGroup.add(xAxisLine);
        xAxisGroup.position.set(xAxisOffset, 0, 0);

        const yAxisGroup = new THREE.Group();
        axisGroup.add(yAxisGroup);
        const yAxis = createSphere(yColor, sphereRadius);
        yAxis.position.set(0, GRID_HEIGHT, 0);
        yAxisGroup.add(yAxis);
        const yAxisLine = createLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, GRID_HEIGHT, 0), yColor, visualizationParams.maxOpacity);
        yAxisGroup.add(yAxisLine);
        yAxisGroup.position.set(xAxisOffset, 0, 0);

        const zAxisGroup = new THREE.Group();
        axisGroup.add(zAxisGroup);
        const zAxis = createSphere(zColor, sphereRadius);
        zAxis.position.set(0, 0, length);
        zAxisGroup.add(zAxis);
        const zAxisLine = createLine(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length), zColor, visualizationParams.maxOpacity);
        zAxisGroup.add(zAxisLine);
        zAxisGroup.position.set(xAxisOffset, 0, 0);

        return axisGroup;
    }

    function createSequencerGrid(width, height, depth, cellSize, color, position, isLeftGrid) {
        const grid = createGrid(width, height, depth, cellSize, color);
        const axis = createAxis(width, SPHERE_RADIUS,
            isLeftGrid ? 0x9400d3 : 0xFF0000,
            0x00FF00,
            0xFFFFFF,
            isLeftGrid
        );
        const sequencerGroup = new THREE.Group();
        sequencerGroup.add(grid);
        sequencerGroup.add(axis);
        sequencerGroup.position.copy(position);
        return sequencerGroup;
    }

    const leftSequencerGroup = createSequencerGrid(
        GRID_WIDTH,
        GRID_HEIGHT,
        GRID_DEPTH,
        CELL_SIZE,
        0x9400d3,
        new THREE.Vector3(-GRID_WIDTH / 2 - 65, 0, -GRID_DEPTH / 2),
        true
    );
    const rightSequencerGroup = createSequencerGrid(
        GRID_WIDTH,
        GRID_HEIGHT,
        GRID_DEPTH,
        CELL_SIZE,
        0xFF0000,
        new THREE.Vector3(GRID_WIDTH / 2 - 65, 0, -GRID_DEPTH / 2),
        false
    );
    mainSequencerGroup.add(leftSequencerGroup, rightSequencerGroup);

    function initializeColumns() {
        if (columns.length === 0) {
            semitones.forEach((semitone, i) => {
                const initialDB = 0;
                const maxOffset = degreesToCells(semitone.deg);
                const offsetLeft = i;
                const columnLeft = createColumn(offsetLeft, i + 1, initialDB, true);
                const columnRight = createColumn(offsetLeft, i + 1, initialDB, false);
                columns.push({
                    left: columnLeft,
                    right: columnRight,
                    offsetX: 0,
                    direction: 1,
                    maxOffset: maxOffset,
                    speed: Math.random() * visualizationParams.animationSpeed + 0.1,
                    dB: initialDB,
                    dBDirection: 1
                });
            });
        }
        columns.forEach(column => {
            if (!column.left.parent) leftSequencerGroup.add(column.left);
            if (!column.right.parent) rightSequencerGroup.add(column.right);
        });
    }

    function getSemitoneLevels(analyser) {
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);
        const sampleRate = audioContext.sampleRate;
        const binSize = sampleRate / (2 * bufferLength);
        return semitones.map(semitone => {
            const binIndex = Math.round(semitone.f / binSize);
            if (binIndex >= bufferLength) return -100;
            const amplitude = dataArray[binIndex];
            if (amplitude === 0) return -100;
            const dB = 20 * Math.log10(amplitude / 255) * 1.5;
            return THREE.MathUtils.clamp(dB, -100, 30);
        });
    }

    function updateSequencerColumns(amplitudes, channel) {
        columns.forEach((column, i) => {
            const dB = amplitudes[i];
            if (isNaN(dB)) return;
            const normalizedDB = THREE.MathUtils.clamp(
                (dB + 100) / (visualizationParams.maxDB + 100),
                0,
                1
            );
            const channelGroup = channel === 'left' ? column.left : column.right;
            const { opacity, color } = calculateOpacityAndColor(i);
            channelGroup.children.forEach(mesh => {
                mesh.material.opacity = 1.0;
                mesh.material.transparent = false;
                mesh.material.color = color;
                const depth = normalizedDB * visualizationParams.maxColumnDepth;
                mesh.scale.z = depth;
                mesh.position.z = depth / 2;
            });
        });
    }

    function setupAudioProcessing(source) {
        const splitter = audioContext.createChannelSplitter(2);
        analyserLeft = audioContext.createAnalyser();
        analyserRight = audioContext.createAnalyser();
        analyserLeft.fftSize = 4096;
        analyserRight.fftSize = 4096;
        analyserLeft.smoothingTimeConstant = 0.3;
        analyserRight.smoothingTimeConstant = 0.3;
        source.connect(splitter);
        splitter.connect(analyserLeft, 0);
        splitter.connect(analyserRight, 1);

        function processAudio() {
            if (isPlaying) {
                const semitoneAmplitudesLeft = getSemitoneLevels(analyserLeft);
                const semitoneAmplitudesRight = getSemitoneLevels(analyserRight);
                updateSequencerColumns(semitoneAmplitudesLeft, 'left');
                updateSequencerColumns(semitoneAmplitudesRight, 'right');
                requestAnimationFrame(processAudio);
            }
        }
        processAudio();
    }

    initializeColumns();

    setInterval(() => {
        if (isPlaying) {
            const semiLevelsLeft = getSemitoneLevels(analyserLeft);
            const semiLevelsRight = getSemitoneLevels(analyserRight);
            updateSequencerColumns(semiLevelsLeft, 'left');
            updateSequencerColumns(semiLevelsRight, 'right');
        }
    }, 50);

    let selectedX = 0;
    let selectedY = 0;
    let selectedZ = 0;
    let currentColumn = null;
    const loader = new THREE.FontLoader();

    function calculateOpacityAndColor(index) {
        const hue = (index / (semitones.length - 1)) * 360;
        const saturation = 100;
        const lightness = 50;
        const color = new THREE.Color(`hsl(${hue}, ${saturation}%, ${lightness}%)`);
        const opacity = 1.0;
        return { opacity, color };
    }

    function degreesToCells(degrees) {
        const maxWidth = 130;
        const minWidth = 1;
        const totalSemitones = semitones.length;
        const width = maxWidth - ((degrees / (totalSemitones - 1)) * (maxWidth - minWidth));
        return Math.max(minWidth, Math.round(width));
    }

    function createColumn(x, y, dB, isLeftGrid) {
        const { opacity, color: lineColor } = calculateOpacityAndColor(y - 1);
        const semitone = semitones[y - 1];
        const width = degreesToCells(semitone.deg);
        const startX = isLeftGrid ? GRID_WIDTH - width : 0;

        const columnGroup = new THREE.Group();
        columnGroup.dB = dB;
        columnGroup.position.x = startX;
        columnGroup.position.y -= 1; // Move down by one cell along Y-axis

        const geometry = new THREE.BoxGeometry(width, 2, 1);
        const material = new THREE.MeshBasicMaterial({ color: lineColor, opacity: 1.0, transparent: false, depthTest: false });
        const columnMesh = new THREE.Mesh(geometry, material);
        columnGroup.add(columnMesh);
        columnMesh.position.set(width / 2, y * 2, 0); // Adjusted Y position

        return columnGroup;
    }

    const fileButton = document.getElementById('fileButton');
    const fileInput = document.getElementById('fileInput');
    const playPauseButton = document.getElementById('playPauseButton');
    let fileSource = null;

    fileButton.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (audioBufferSource) {
                    audioBufferSource.stop();
                    audioBufferSource.disconnect();
                    audioBufferSource = null;
                }
                if (audioContext) {
                    audioContext.close();
                    audioContext = null;
                }

                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                audioContext.decodeAudioData(e.target.result)
                    .then(buffer => {
                        fileSource = buffer;
                        playPauseButton.disabled = false;
                        startOffset = 0;
                        fileButton.classList.add('active');
                    })
                    .catch(err => {
                        console.error('Error decoding audio data:', err);
                    });
            };
            reader.readAsArrayBuffer(file);
        }
    });
              const micButton = document.getElementById('micButton');
            let isRecording = false;
            let microphoneStream;

            micButton.addEventListener('click', () => {
                if (!isRecording) {
                    micButton.classList.add('active');
                    navigator.mediaDevices.getUserMedia({ audio: true })
                        .then(stream => {
                            if (!audioContext) {
                                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                            }
                            microphoneStream = stream;
                            const source = audioContext.createMediaStreamSource(stream);
                            setupAudioProcessing(source); 
                            isRecording = true;
                            isPlaying = true; // Start animation when recording
                        })
                        .catch(err => {
                            console.error("Error accessing microphone:", err);
                            micButton.classList.remove('active');
                            isRecording = false;
                            isPlaying = false;
                        });
                } else {
                    micButton.classList.remove('active');
                    if (microphoneStream) {
                        microphoneStream.getTracks().forEach(track => track.stop());
                        microphoneStream = null;
                    }
                    if (audioContext && audioBufferSource) {
                        audioBufferSource.disconnect();
                        analyserLeft.disconnect();
                        analyserRight.disconnect();
                    }
                    isRecording = false;
                    isPlaying = false; // Stop animation when recording stops
                }
            });

            const playPauseButtonOriginalHTML = playPauseButton.innerHTML;

            playPauseButton.addEventListener('click', () => {
                if (!fileSource) return;

                const playIcon = document.getElementById('playIcon');
                const pauseIcon = document.getElementById('pauseIcon');

                if (!isPlaying) {
                    if (!audioContext) {
                        audioContext = new (window.AudioContext || window.webkitAudioContext)();
                    }

                    audioBufferSource = audioContext.createBufferSource();
                    audioBufferSource.buffer = fileSource;

                    setupAudioProcessing(audioBufferSource);
                    
                    audioBufferSource.connect(audioContext.destination);
                    audioBufferSource.start(0, startOffset);
                    startTimestamp = audioContext.currentTime - startOffset;
                    isPlaying = true;
                    playPauseButton.classList.add('active');

                    playIcon.classList.add('icon-hidden');
                    playIcon.classList.remove('icon-visible');
                    pauseIcon.classList.add('icon-visible');
                    pauseIcon.classList.remove('icon-hidden');

                    audioBufferSource.onended = () => {
                        isPlaying = false;
                        startOffset = 0;
                        playPauseButton.classList.remove('active');
                        playIcon.classList.add('icon-visible');
                        playIcon.classList.remove('icon-hidden');
                        pauseIcon.classList.add('icon-hidden');
                        pauseIcon.classList.remove('icon-visible');
                    };
                } else {
                    if (audioBufferSource) {
                        audioBufferSource.stop();
                        audioBufferSource.disconnect();
                        audioBufferSource = null;
                        startOffset = audioContext.currentTime - startTimestamp;
                        isPlaying = false;
                        playPauseButton.classList.remove('active');

                        playIcon.classList.add('icon-visible');
                        playIcon.classList.remove('icon-hidden');
                        pauseIcon.classList.add('icon-hidden');
                        pauseIcon.classList.remove('icon-visible');
                    }
                }
            });

            let recordedGestures = [];
            const gestureModal = document.getElementById('gestureModal');
            const gestureRecordButton = document.getElementById('gestureRecordButton');
            const closeGestureModal = document.getElementById('closeGestureModal');
            const startRecordingButton = document.getElementById('startRecordingButton');
            const stopRecordingButton = document.getElementById('stopRecordingButton');
            const gestureStatus = document.getElementById('gestureStatus');
            const gestureCanvas = document.getElementById('gestureCanvas');
            const gestureCtx = gestureCanvas.getContext('2d');
            let isGestureRecording = false;
            let gestureData = [];
            let gestureStartTime = 0;

            gestureRecordButton.addEventListener('click', () => {
                gestureModal.style.display = 'block';
                gestureRecordButton.classList.add('active');
            });

            closeGestureModal.addEventListener('click', () => {
                gestureModal.style.display = 'none';
                resetGestureRecording();
                gestureRecordButton.classList.remove('active');
            });

            startRecordingButton.addEventListener('click', () => {
                if (!isGestureRecording) {
                    isGestureRecording = true;
                    gestureData = [];
                    gestureStartTime = Date.now();
                    gestureStatus.textContent = 'Recording gesture...';
                    startRecordingButton.disabled = true;
                    stopRecordingButton.disabled = false;
                    gestureCanvas.width = gestureCanvas.clientWidth;
                    gestureCanvas.height = gestureCanvas.clientHeight;
                    gestureCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
                    gestureRecordButton.classList.add('active');
                }
            });

            stopRecordingButton.addEventListener('click', () => {
                if (isGestureRecording) {
                    isGestureRecording = false;
                    gestureStatus.textContent = 'Gesture recorded.';
                    startRecordingButton.disabled = false;
                    stopRecordingButton.disabled = true;
                    visualizeGesture();
                    gestureRecordButton.classList.remove('active');
                }
            });

            function resetGestureRecording() {
                isGestureRecording = false;
                gestureData = [];
                gestureStatus.textContent = 'Press "Start Recording" to begin.';
                startRecordingButton.disabled = false;
                stopRecordingButton.disabled = true;
                gestureCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
            }

            async function setupHandposeForGesture() {
                try {
                    const handposeModel = await handpose.load();
                    setInterval(async () => {
                        if (currentStream && isGestureRecording && isPlaying) {
                            const predictions = await handposeModel.estimateHands(cameraView);
                            if (predictions.length > 0) {
                                const landmarks = predictions[0].landmarks;
                                const timestamp = Date.now() - gestureStartTime;
                                gestureData.push({ landmarks, timestamp });
                                drawGestureFrame(landmarks);
                            }
                        }
                    }, 100);
                } catch (err) {
                    console.error('Error setting up Handpose for gesture recording:', err);
                }
            }

            function drawGestureFrame(landmarks) {
                gestureCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                gestureCtx.beginPath();
                landmarks.forEach((point, index) => {
                    const x = (point[0] / cameraView.videoWidth) * gestureCanvas.width;
                    const y = (point[1] / cameraView.videoHeight) * gestureCanvas.height;
                    if (index === 0) {
                        gestureCtx.moveTo(x, y);
                    } else {
                        gestureCtx.lineTo(x, y);
                    }
                });
                gestureCtx.strokeStyle = '#00FF00';
                gestureCtx.lineWidth = 2;
                gestureCtx.stroke();
            }

            function visualizeGesture() {
                gestureCtx.clearRect(0, 0, gestureCanvas.width, gestureCanvas.height);
                gestureCtx.strokeStyle = '#00FF00';
                gestureCtx.lineWidth = 2;
                gestureCtx.beginPath();
                gestureData.forEach(({ landmarks }, index) => {
                    const fingertip = landmarks[8];
                    const x = (fingertip[0] / cameraView.videoWidth) * gestureCanvas.width;
                    const y = (fingertip[1] / cameraView.videoHeight) * gestureCanvas.height;
                    if (index === 0) {
                        gestureCtx.moveTo(x, y);
                    } else {
                        gestureCtx.lineTo(x, y);
                    }
                });
                gestureCtx.stroke();
            }

            setupHandposeForGesture();
              const hammer = new Hammer(renderer.domElement);
            hammer.get('pan').set({ direction: Hammer.DIRECTION_ALL });

            let currentRotationX = 0;
            let currentRotationY = 0;

            hammer.on('pan', (ev) => {
                const deltaX = ev.deltaX * 0.01;
                const deltaY = ev.deltaY * 0.01;

                let newRotationY = currentRotationY + deltaX;
                let newRotationX = currentRotationX + deltaY;

                newRotationX = THREE.MathUtils.clamp(newRotationX, -ROTATION_LIMIT, ROTATION_LIMIT);
                newRotationY = THREE.MathUtils.clamp(newRotationY, -ROTATION_LIMIT, ROTATION_LIMIT);

                mainSequencerGroup.rotation.y = newRotationY;
                mainSequencerGroup.rotation.x = newRotationX;
            });

            hammer.on('panend', () => {
                currentRotationX = mainSequencerGroup.rotation.x;
                currentRotationY = mainSequencerGroup.rotation.y;
            });

            mainSequencerGroup.position.set(0, 0, 0);

            function updatePlayhead() {
                if (!isPlaying || !audioBufferSource || !audioBufferSource.buffer) return;
                const currentTime = audioContext.currentTime - startTimestamp;
                const duration = audioBufferSource.buffer.duration;
                if (currentTime >= duration) {
                    playhead.style.left = `${timelineWidth}px`;
                    return;
                }
                const progress = duration ? (currentTime / duration) : 0;
                playhead.style.left = `${progress * timelineWidth}px`;
            }

            function animate() {
                requestAnimationFrame(animate);
                renderer.render(scene, camera);
                updatePlayhead();
            }
            animate();

            const fullscreenButton = document.getElementById('fullscreenButton');
            fullscreenButton.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen();
                } else {
                    document.exitFullscreen();
                }
                fullscreenButton.classList.toggle('active');
            });

            const xrButton = document.getElementById('xrButton');
            const toggleCameraButton = document.getElementById('toggleCameraButton');
            let currentStream = null;
            let useFrontCamera = true;
            let xrState = 0; // 0: Off, 1: Back Camera, 2: Front Camera

            xrButton.addEventListener('click', async () => {
                xrState = (xrState + 1) % 3;
                switch(xrState) {
                    case 0:
                        // Off
                        document.getElementById('xrLabel').style.display = 'block';
                        document.getElementById('xrArrow1').style.display = 'none';
                        document.getElementById('xrArrow2').style.display = 'none';
                        if (currentStream) {
                            stopStream();
                        }
                        xrButton.classList.remove('active');
                        break;
                    case 1:
                        // Back Camera
                        document.getElementById('xrLabel').style.display = 'none';
                        document.getElementById('xrArrow1').style.display = 'block';
                        document.getElementById('xrArrow2').style.display = 'block';
                        try {
                            const constraints = {
                                video: { facingMode: "environment" },
                                audio: false
                            };
                            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                            cameraView.srcObject = currentStream;
                            cameraView.style.display = 'block';
                            toggleCameraButton.style.display = 'flex';
                            await setupHandpose(currentStream);
                            document.body.style.backgroundColor = 'transparent';
                            xrButton.classList.add('active');
                        } catch (err) {
                            console.error('Error accessing back camera:', err);
                            xrButton.classList.remove('active');
                        }
                        break;
                    case 2:
                        // Front Camera
                        document.getElementById('xrLabel').style.display = 'none';
                        document.getElementById('xrArrow1').style.display = 'block';
                        document.getElementById('xrArrow2').style.display = 'block';
                        try {
                            if (currentStream) {
                                stopStream();
                            }
                            const constraints = {
                                video: { facingMode: "user" },
                                audio: false
                            };
                            currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                            cameraView.srcObject = currentStream;
                            cameraView.style.display = 'block';
                            toggleCameraButton.style.display = 'flex';
                            await setupHandpose(currentStream);
                            document.body.style.backgroundColor = 'transparent';
                            xrButton.classList.add('active');
                        } catch (err) {
                            console.error('Error accessing front camera:', err);
                            xrButton.classList.remove('active');
                        }
                        break;
                }
            });

            toggleCameraButton.addEventListener('click', async () => {
                if (currentStream) {
                    useFrontCamera = !useFrontCamera;
                    stopStream();
                    try {
                        const constraints = {
                            video: { facingMode: useFrontCamera ? "user" : "environment" },
                            audio: false
                        };
                        currentStream = await navigator.mediaDevices.getUserMedia(constraints);
                        cameraView.srcObject = currentStream;
                    } catch (err) {
                        console.error('Error switching camera:', err);
                    }
                }
            });

            function stopStream() {
                if (currentStream) {
                    currentStream.getTracks().forEach(track => track.stop());
                    currentStream = null;
                }
                cameraView.srcObject = null;
                cameraView.style.display = 'none';
                toggleCameraButton.style.display = 'none';
                document.body.style.backgroundColor = 'var(--color-bg)';
                xrButton.classList.remove('active');
            }

            function setupHandpose(videoStream) {
                return handpose.load().then(handposeModel => {
                    setInterval(async () => {
                        if (videoStream && isGestureRecording && isPlaying) {
                            const predictions = await handposeModel.estimateHands(cameraView);
                            if (predictions.length > 0) {
                                const fingertips = predictions[0].landmarks.slice(8, 20, 4);
                                const frameData = {
                                    timestamp: Date.now(),
                                    fingertips: fingertips.map(point => ({ x: point[0], y: point[1], z: point[2] }))
                                };
                                recordedGestures.push(frameData);
                                drawTimeline();
                            }
                        }
                    }, 50);
                }).catch(err => {
                    console.error('Error setting up handpose:', err);
                });
            }

            function drawTimeline() {
                ctx.clearRect(0, 0, timelineWidth, timelineHeight);
                if (recordedGestures.length > 0) {
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    recordedGestures.forEach((frame, i) => {
                        const x = (i / recordedGestures.length) * timelineWidth;
                        const y = frame.fingertips ? (frame.fingertips[0].y / cameraView.videoHeight) * timelineHeight : timelineHeight / 2;
                        if (i === 0) {
                            ctx.moveTo(x, y);
                        } else {
                            ctx.lineTo(x, y);
                        }
                    });
                    ctx.stroke();
                }
            }

            if (window.Telegram) {
                Telegram.WebApp.ready();
                Telegram.WebApp.onEvent('data', (data) => {
                    if (data && data.text) {
                        const aiLabel = document.querySelector('.ai-label');
                        const parts = data.text.split(' ', 2);
                        const firstPart = parts[0] || '';
                        const secondPart = parts[1] || '';
                        aiLabel.innerHTML = `<span>${firstPart}</span><span>${secondPart}</span>`;
                    }
                });
            } else {
                console.log('Telegram WebApp not available');
            }
              window.addEventListener('resize', () => {
                const width = window.innerWidth;
                const height = window.innerHeight;

                camera.left = -width / 2;
                camera.right = width / 2;
                camera.top = height / 2;
                camera.bottom = -height / 2;
                camera.updateProjectionMatrix();

                renderer.setSize(width, height);
                timelineWidth = timelineContainer.clientWidth;
                timelineHeight = timelineContainer.clientHeight;
                timelineCanvas.width = timelineWidth;
                timelineCanvas.height = timelineHeight;
                hologramWidth = GRID_WIDTH * 2 * INITIAL_SCALE;
                scaleFactor = timelineWidth / hologramWidth * 0.9;
                mainSequencerGroup.scale.set(INITIAL_SCALE * scaleFactor, INITIAL_SCALE * scaleFactor, INITIAL_SCALE * scaleFactor);
            });

            const scanButton = document.getElementById('scanButton');
            const scanOverlay = document.getElementById('scanOverlay');

            scanButton.addEventListener('click', () => {
                scanOverlay.style.display = 'flex';
                scanButton.classList.add('scan-active');

                setTimeout(() => {
                    scanOverlay.style.display = 'none';
                    scanButton.classList.remove('scan-active');
                    activateDecodingFunctions();
                }, 2000);
            });

            function activateDecodingFunctions() {
                console.log('Decoding gestures, audio, text, video, and other data from the hologram.');

                if (isGestureRecording) {
                    console.log('Decoding gestures...');
                }

                if (isPlaying) {
                    console.log('Decoding audio...');
                }

                console.log('Decoding text...');
                console.log('Decoding video...');
            }

            // Eye Button Functionality
            const eyeButton = document.getElementById('eyeButton');
            eyeButton.addEventListener('click', () => {
                mainSequencerGroup.visible = !mainSequencerGroup.visible;
                eyeButton.classList.toggle('active');
            });
        });
    </script>
</body>
</html>
