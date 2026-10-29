# Library model

Requested source: https://sketchfab.com/3d-models/3d--library-01-2ad7f048f73c48fba9624bf62fb2d3bd

No model is bundled here. The source cannot currently be fetched from the managed environment; its author, download rights and license have not been verified. The application shows its original procedural library while this asset is missing.

Provide the official downloaded asset and license/attribution. Once verified, export it to a self-contained `library.glb` in this directory, keeping all textures embedded and preserving the license/provenance alongside it. Do not rename a Sketchfab HTML page or copy protected viewer assets. Keep the asset optimized for web delivery.

The first-person renderer loads `/models/library/library.glb` locally, centers it, places its bottom on the floor and scales it to the room envelope (14×10 metres, 3.5m high). Final alignment, furniture collision and the six interactive chairs must be checked against the supplied model before calling that model integration complete. Generic scaling cannot guarantee an arbitrary library's walkable layout matches the server geometry in `src/lib/room-space.ts`.
