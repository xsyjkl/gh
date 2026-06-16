AFRAME.registerComponent('obvious-animal-motion', {
      init: function () {
        this.modelEl = this.el.querySelector('a-gltf-model');
        this.model = null;
        this.mixers = [];
        this.animalMotions = [];
        this.waveParts = [];
        this.elapsed = 0;
        this.markerVisible = false;
        this.modelReady = false;
        this.animationsStarted = false;

        this.el.addEventListener('markerFound', () => {
          this.markerVisible = true;
          this.playModelAnimations();
        });

        this.el.addEventListener('markerLost', () => {
          this.markerVisible = false;
          this.pauseModelAnimations();
        });

        if (this.modelEl) {
          this.modelEl.addEventListener('model-loaded', () => {
            this.prepareAnimalMotions();
            if (this.markerVisible) this.playModelAnimations();
          });
        }
      },

      prepareAnimalMotions: function () {
        this.model = this.modelEl.getObject3D('mesh');
        if (!this.model || this.modelReady) return;

        this.modelReady = true;
        this.animalMotions = [];
        this.waveParts = [];

        // 三只青蛙重新分工：
        // 转圈青蛙用“中心点旋转”，避免围着椅子绕圈；另外两只青蛙一直上下蹦跳。
        this.addAnimalMotion('骨架', 'frog-seat-spin-self', 0.0, true);  // 青蛙 A：坐在椅子上水平快速自转
        this.addAnimalMotion('骨架.001', 'frog-bounce-updown', 1.3, true); // 青蛙 B：一直上下蹦跳
        this.addAnimalMotion('骨架.002', 'frog-bounce-updown', 2.4, true); // 青蛙 C：一直上下蹦跳

        // 去掉转圈青蛙前面的西瓜/桌面食物，避免挡住视线。
        this.hideObjectByName('立方体.137');

        // 灰色小动物：身体小幅晃动 + 头部大幅摇头，效果更明显。
        this.addAnimalMotion('骨架.003', 'gray-cat-body-bob', 0.6);
        this.addAnimalMotion('头部', 'gray-cat-head-swing', 0.2);

        // 猫厨师保留明显的挥手/摆动。
        this.addAnimalMotion('骨架.004', 'cat-chef-dance', 1.7);

        // 单独抓猫手臂，让挥手动作更夸张。
        this.addWavePart('猫右臂', 1, 0.1);
        this.addWavePart('猫左臂', -1, 0.7);

        // 兜底：如果模型导出的节点名带了后缀，也能找到猫手臂。
        this.model.traverse((node) => {
          if (!node.name) return;
          if (node.name.indexOf('猫右臂') !== -1 && !this.waveParts.some(p => p.object === node)) {
            this.captureWavePart(node, 1, 0.1);
          }
          if (node.name.indexOf('猫左臂') !== -1 && !this.waveParts.some(p => p.object === node)) {
            this.captureWavePart(node, -1, 0.7);
          }
        });
      },

      addAnimalMotion: function (name, type, phase, useCenterPivot) {
        let object = this.model.getObjectByName(name);
        if (!object) return;

        if (useCenterPivot) {
          object = this.createCenterPivotForObject(object, name + '-center-pivot');
        }

        this.animalMotions.push({
          object,
          type,
          phase,
          basePosition: object.position.clone(),
          baseQuaternion: object.quaternion.clone(),
          baseScale: object.scale.clone()
        });
      },

      createCenterPivotForObject: function (object, pivotName) {
        const parent = object.parent;
        if (!parent) return object;

        // 手机兼容版：不在手机上实时计算 Box3 包围盒，避免 iPhone Safari 加载时卡住。
        // 这里直接使用已经算好的三只青蛙中心点，让它们像坐在椅子上原地水平转圈。
        const fixedCenters = {
          '骨架-center-pivot': new THREE.Vector3(5.3952, 0.1461, -0.9082),
          '骨架.001-center-pivot': new THREE.Vector3(3.2324, 0.1858, -0.5573),
          '骨架.002-center-pivot': new THREE.Vector3(3.0283, -0.3788, 2.4641)
        };

        const centerLocal = fixedCenters[pivotName] || object.position.clone();
        const originalPosition = object.position.clone();
        const pivot = new THREE.Group();
        pivot.name = pivotName;
        pivot.position.copy(centerLocal);

        parent.add(pivot);
        parent.remove(object);
        pivot.add(object);

        object.position.copy(originalPosition.sub(centerLocal));
        return pivot;
      },

      hideObjectByName: function (name) {
        const object = this.model.getObjectByName(name);
        if (!object) return;
        object.visible = false;
      },

      addWavePart: function (name, side, phase) {
        const object = this.model.getObjectByName(name);
        if (!object) return;
        this.captureWavePart(object, side, phase);
      },

      captureWavePart: function (object, side, phase) {
        this.waveParts.push({
          object,
          side,
          phase,
          baseQuaternion: object.quaternion.clone()
        });
      },

      playModelAnimations: function () {
        if (!this.modelReady) return;
        if (this.animationsStarted) return;

        const clips = this.model.animations || [];
        if (clips.length > 0) {
          const mixer = new THREE.AnimationMixer(this.model);
          clips.forEach((clip) => {
            const action = mixer.clipAction(clip);
            action.reset();
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();
          });
          this.mixers.push(mixer);
        }

        this.animationsStarted = true;
      },

      pauseModelAnimations: function () {
        this.mixers.forEach((mixer) => mixer.stopAllAction());
        this.mixers = [];
        this.animationsStarted = false;
      },

      tick: function (time, deltaTime) {
        if (!this.modelReady || !this.markerVisible) return;

        const dt = Math.min(deltaTime / 1000, 0.05);
        this.elapsed += dt;

        this.mixers.forEach((mixer) => mixer.update(dt));

        const t = this.elapsed;
        this.animalMotions.forEach((item) => {
          const obj = item.object;
          const p = item.phase;

          obj.position.copy(item.basePosition);
          obj.quaternion.copy(item.baseQuaternion);
          obj.scale.copy(item.baseScale);

          if (item.type === 'frog-seat-spin-self') {
            // 转圈青蛙：使用中心 pivot 水平快速自转，视觉上像坐在椅子上原地转圈。
            obj.rotateY(t * 7.4 + p);
          }

          if (item.type === 'frog-bounce-updown') {
            // 另外两只青蛙：持续上下蹦跳，不加左右位移，避免跑出位置。
            obj.position.y += Math.abs(Math.sin(t * 6.2 + p)) * 0.34;
            obj.rotateX(Math.sin(t * 6.2 + p) * 0.16);
            obj.rotateZ(Math.sin(t * 8.0 + p) * 0.14);
            const pulse = 1 + Math.sin(t * 10.5 + p) * 0.09;
            obj.scale.multiplyScalar(pulse);
          }

          if (item.type === 'gray-cat-body-bob') {
            // 灰色小动物身体轻轻晃，重点视觉放在头部大幅摇动。
            obj.position.y += Math.sin(t * 3.0 + p) * 0.04;
            obj.rotateZ(Math.sin(t * 4.0 + p) * 0.06);
            obj.rotateY(Math.sin(t * 3.4 + p) * 0.16);
          }

          if (item.type === 'gray-cat-head-swing') {
            // 灰色小动物头部大幅摇头晃脑，效果更明显。
            obj.rotateY(Math.sin(t * 7.5 + p) * 0.95);
            obj.rotateX(Math.sin(t * 5.8 + p) * 0.26);
            obj.rotateZ(Math.sin(t * 6.2 + p) * 0.18);
          }

          if (item.type === 'cat-chef-dance') {
            // 猫厨师：更夸张的摇摆，像在跳舞。
            obj.position.y += Math.abs(Math.sin(t * 4.6 + p)) * 0.18;
            obj.position.x += Math.sin(t * 2.6 + p) * 0.12;
            obj.rotateY(Math.sin(t * 4.8 + p) * 0.75);
            obj.rotateZ(Math.sin(t * 6.0 + p) * 0.28);
          }
        });

        this.waveParts.forEach((part) => {
          const obj = part.object;
          obj.quaternion.copy(part.baseQuaternion);
          obj.rotateZ(part.side * Math.sin(t * 8.0 + part.phase) * 1.15);
          obj.rotateX(Math.sin(t * 6.5 + part.phase) * 0.42);
        });
      }
    });
  