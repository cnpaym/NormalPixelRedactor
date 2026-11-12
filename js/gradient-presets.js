'use strict';
/* Готовые градиенты: 124 двухцветных перехода из набора GPE_Colors.
   Каждая запись — 12 hex-цифр: начальный и конечный цвет. */
(function (NPR) {
  NPR.gradientPresets = [
    'dfc2c8a88e8d f50a22ffe2e2 f50a22df4710 960a0b290c0d 6e0f11241112 471417201517 d8c1c8d7c4c3 d80d50d4086d',
    'd4086df5d3e2 d4086d8a043e d4086ddf4710 d6c1dba88e8d 67496aa88e8d 563b5f5f5975 563b5fc3c7c2 d0c1dbd7c4c3',
    '7c6fa2d2d1c3 7c6fa2c1b9bf 856f90c1b9bf 856f90d2d1c3 5f497da88e8d 4e3a72c3c7c2 4e3a725f5975 c4c1dbf7d1c3',
    '939adaa88e8d 9b9ac7a88e8d 787cbb97aac2 807ca897aac2 edf3f8caf0fc 7dcafe95a6b6 88bad69a9fa0 6ea8cf808d99',
    '59a2d57fcbfd 59a2d57c6fa2 59a2d5beffff 67acc479918e 6d9cb789bad5 5f91b4b7dff9 5f91b4cdfffe 718f9eb3c9d2',
    '718f9ec4e1d6 538ab070a9ce 4c8ea569acc3 587d979ab8cb 587d97aad0cf 5469799a9fa0 385e8295a6b6 435a6eb5d8d5',
    '435a6e516988 3a5772808d99 214b73b9f2fd 214b73345f96 2949679bc6ce 294967375881 224c5c94cac3 224c5c315b76',
    'd7ffff95a6b6 cefeffd4eeff beffffffffff b9e1d7e9e1d7 b2d0d0808d99 abcfd0afc3d0 9fd0d0d0d0d0 98d3c5c9d3c5',
    '51818c93bbc0 51818ca3d3c4 179aa31b5da0 1a8e961e5893 345b6779918e cbe1d79a9fa0 c5e1d7c9d5d7 abd3c579918e',
    'a4d3c5a9c7c5 05b90e417a07 245c12243f12 4b910605b90e 417a070a9b11 f5eec4c28710 f5eec4f5ce82 ffd400eb8a18',
    'ffff00ffca00 f9dbb8ffd400 f9dbb8ffeca0 f9dbb8eb8a18 e9d0a2f2b251 d4c2a8e3c8a8 d4c2a8c7ad97 e8c27cac6c0d',
    'e8c27cd6a515 e8c27cc08314 eb88157f490b a18a59af996b a18a5994724b 876843a8885d 2a211c3c322d 2a211c1f140e',
    '1f140ea8885d 1f140e3c322d 1f140ea7846e 1f140ea28f89 ff0000df4710 ff0000790404 ff0000d80d50 e50000e24b4b',
    'e50000870a0a e50000d80f0f e50000320303 990f0f4b0404 990f0f630606 7904048a043e ededede0e0e0 ccc2c8f7d1c3',
    'b7a4afbb9bb7 a6a8aadee5e8 a28f89a7846e 5b5a5ea6a8aa 5b5a5e737578 4d4d4d676363 4d4d4d302d2d 343331252525',
    '343331414141 18171a5b5a5e 131212080808 0a0a0a1c1c1c',
  ].join(' ').split(' ').map((s, i) => ({ name: 'GPE ' + (i + 1), stops: [[0, '#' + s.slice(0, 6)], [1, '#' + s.slice(6)]] }));
})(window.NPR);
