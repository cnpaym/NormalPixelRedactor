NormalPixelRedactor

A pixel art editor that runs in your browser. No installation needed, and it works offline once opened (installable as a PWA). Your work is autosaved in the browser, and the last project opens automatically.

I originally built it for the needs of my own game, and it grew into a full toolset for pixel art and sprite animation.

Drawing
Pencil, eraser, fill, eyedropper, line, rectangle, ellipse, outline and text tools
Pixel-perfect drawing, brush sizes 1–64 px, X/Y symmetry, dithering brushes
Shading mode: the pencil shifts tones along your palette instead of placing a color
Custom brushes made from a selection
Rectangle, ellipse, lasso and magic wand selections
Gradients: linear, radial, angular and diamond, with stepped and dithered modes and a library of 124 presets
Layers with opacity, locking, merging and drag & drop ordering
Reference images (under, over, or as a pinned mini-window) with an eyedropper that works on them
Seamless tile preview (3×3) for textures and tilesets
Palettes: import .hex / .gpl / .pal / .png, export .hex / .gpl, or make one from your canvas
Animation
Frame-based spritesheets with onion skin and playback
Hit arcs, hit flash and shake, drop shadows, outlines on every frame and afterimage trails
Tweening with easing curves
Auto-Idle: generates breathing frames from a single frame
Color cycling (lava, water, runes)
Special tools
Light and depth: up to 4 colored light sources, depth brushes, textures and animated lighting. Shading is done by shifting along your palette, not just brightening.
Particles: a node-based emitter system with presets such as fire, snow, rain, fireworks, portal and magic. Particles can collide with your drawing and light up the environment.
Cloth: cloaks, flags, banners, hair and skirts, simulated with wind and baked into looping frames.
Text: built-in fonts (Latin and Cyrillic), custom fonts, and ready-made styles such as gold, steel, stone and blood.
Export
PNG (×1–×16), animated GIF, spritesheets and atlases
Roblox support: Luau frame tables (ImageRectOffset, ImageRectSize) and a 9-slice helper with a ready SliceCenter value
Other
Works with mouse, pen and touch (gestures, offset cursor mode)
Interface in English and Russian
Customizable hotkeys
Free and open source (MIT license)
AI disclosure

The code of this editor was written with the help of Claude (Anthropic’s LLM). I designed the features and tested the tool myself. The editor does not use AI to generate art: everything you draw in it is made by you.
