# Licences des assets

Le jeu n'embarque aucun asset binaire : tout est généré en code. Les seuls fichiers
tiers sont des modules de three.js, sous licence MIT.

| Fichier | Origine | Licence |
|---|---|---|
| `three@0.170.0` (importmap, jsDelivr) | https://github.com/mrdoob/three.js | MIT |
| `three/addons/objects/Water.js` (miroir d'eau) | three.js examples/jsm, 0.170.0 | MIT |
| `three/addons/postprocessing/*` (bloom, composer) | three.js examples/jsm, 0.170.0 | MIT |
| `tools/vendor/` (miroir local pour le harnais, hors jeu livré) | copie des fichiers ci-dessus | MIT |

Texte de la licence MIT de three.js :

```
The MIT License

Copyright © 2010-2024 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

Le personnage articulé du bloc 1 v4 est procédural (`src/diver.js`), pas de modèle
Quaternius téléchargé : rien à licencier. Si un modèle CC0 est intégré plus tard,
sa licence sera ajoutée ici avant le commit.
