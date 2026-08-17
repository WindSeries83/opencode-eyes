# 👁️ opencode-eyes

**Donnez des yeux à chaque agent. Automatiquement.**

[![npm version](https://img.shields.io/npm/v/opencode-eyes)](https://www.npmjs.com/package/opencode-eyes)
[![license](https://img.shields.io/npm/l/opencode-eyes)](LICENSE)
[![CI](https://img.shields.io/github/actions/workflow/status/WindSeries83/opencode-eyes/ci.yml)](https://github.com/WindSeries83/opencode-eyes/actions)

> 🇬🇧 [Read in English](README.md)

## Le problème

Vous envoyez à votre agent une capture d'écran, un diagramme, une maquette. Il échoue. Pas parce
que la tâche est difficile — parce que **votre modèle est aveugle**. Alors vous changez de modèle à
la main, vous créez un « agent vision » séparé qu'il faut penser à appeler, ou vous espérez que le
modèle devine à partir du texte alternatif. Chacune de ces options est un impôt sur votre
productivité, payé à chaque image.

## Ce que fait opencode-eyes

Il vit dans OpenCode et surveille. Dès qu'un message avec une image échoue, il **rejoue
silencieusement le message sur un modèle capable de voir** — le moins cher disponible. Pas de
changement manuel, pas d'agent dédié à appeler, pas de config à écrire. Vous envoyez la capture.
Ça marche.

```text
Vous                OpenCode                    opencode-eyes
 │  colle une image    │                               │
 │────────────────────►│  agent (modèle aveugle)      │
 │                     │─────────────────────────────►│  "image détectée, armé"
 │                     │◄─────────────────────────────│
 │                     │  ❌ session.error            │
 │                     │─────────────────────────────►│  "rejeu sur groq/llama-4-maverick (gratuit)"
 │                     │  ✅ réponse avec vision      │
 │◄────────────────────│                               │
```

## Pourquoi c'est mieux que les alternatives

| Approche | Vous devez | Coût |
|---|---|---|
| **opencode-eyes** | Rien. Installez et oubliez. | Modèle avec vision le moins cher d'abord, escalade uniquement en cas d'échec |
| Changement de modèle manuel | Remarquer l'échec, changer de modèle, renvoyer | Votre temps, à chaque fois |
| « Agent vision » dédié | Penser à le solliciter, gérer son contexte | Votre temps + dette de contexte |
| Liste de modèles codée en dur | La maintenir en phase avec vos fournisseurs | Fausse dès le premier fournisseur ajouté |

**Aucun autre plugin OpenCode ne fait ça automatiquement.** Nous avons cherché. Les autres
demandent de la configuration, ciblent un seul fournisseur, ou meurent avec une liste de modèles
périmée. opencode-eyes découvre vos modèles en direct — rien de codé en dur, rien à maintenir.

## Des faits, pas des promesses

- **Zéro configuration.** `"plugin": ["opencode-eyes"]` et c'est tout.
- **Fonctionne avec n'importe quel fournisseur** — OpenAI, Anthropic, Groq, Google, modèles
  locaux. La chaîne est construite à partir de la liste *live* des fournisseurs de votre instance
  OpenCode : elle reflète toujours ce que vous avez réellement connecté et authentifié.
- **Les offres gratuites d'abord.** Ajoutez `preferProviders: ["groq"]` et les modèles gratuits
  sont essayés avant tout repli payant. Définissez `maxCost` pour ne jamais dépasser un budget.
  Votre portefeuille décide.
- **Sûr en cas de panne.** Si un renvoi échoue lui-même (fournisseur down, requête invalide), le
  plugin arrête de router cette session au lieu de marteler à l'aveugle. Les erreurs concurrentes
  sont dédupliquées. Ni tempête d'erreurs, ni boucle infinie.
- **Minuscule.** 18 kB sur disque, une seule dépendance. Rien à maintenir, rien à auditer deux fois.
- **Testé.** 26 tests unitaires, vérification de types, CI à chaque push. Licence MIT.

## Installation

### Depuis npm (recommandé)

```jsonc
// opencode.jsonc
{
  "plugin": ["opencode-eyes"]
}
```

Redémarrez OpenCode. Terminé.

### En local (test, sans publier)

Déposez un fichier loader dans le répertoire global des plugins d'OpenCode :

`~/.config/opencode/plugins/eyes.js`
```js
export { VisionRouterPlugin } from "file:///chemin/absolu/vers/opencode-eyes/dist/index.js";
```

Puis `npm install && npm run build` dans ce dépôt. OpenCode charge automatiquement tout fichier
`.js`/`.ts` placé dans `~/.config/opencode/plugins/` au démarrage — aucune modification de config
nécessaire.

## Essayez-le en 30 secondes

1. Installez le plugin, redémarrez OpenCode.
2. Gardez votre modèle préféré par défaut — même un modèle texte pas cher.
3. Collez une capture d'écran dans une session et posez une question dessus.

Si votre modèle par défaut ne voit pas, vous obtenez la réponse d'un modèle avec vision au lieu
d'une erreur. C'est toute la démo.

## Configuration

Le `VisionRouterPlugin` par défaut ne nécessite aucune configuration. Pour un contrôle fin,
enregistrez le plugin programmatiquement avec des options :

```ts
// my-plugin.ts
import { createVisionRouter } from "opencode-eyes";

export const VisionRouterPlugin = createVisionRouter({
  maxAttempts: 3,               // max de renvois de repli par image (défaut 4)
  maxCost: 5,                   // ignore les modèles dont le coût d'entrée dépasse ce montant (défaut : sans limite)
  preferProviders: ["groq"],    // route les modèles de ces fournisseurs en premier, ordre de coût conservé (défaut : [])
  excludeProviders: ["local"],  // ne jamais router vers ces fournisseurs (défaut : [])
  excludeModels: ["openai/gpt-4o", "claude-sonnet"], // id seul ou "providerID/modelID" (défaut : [])
  cacheMs: 300_000,             // durée de mise en cache de la chaîne de modèles (défaut 5 min)
  debug: false,                 // journalise les décisions de routage sur stderr (défaut false)
});
```

## Comment ça marche

1. À chaque message entrant, le plugin vérifie les pièces jointes à la recherche d'une image (`mime`
   commençant par `image/`).
2. S'il en trouve une, il marque la session comme « vision en attente ».
3. Si OpenCode signale une `session.error` pour cette session, le plugin cherche parmi vos
   fournisseurs **connectés** tous les modèles capables d'accepter des images, les trie par coût
   d'entrée, et renvoie le même message via `client.session.prompt()` sur le modèle suivant de la
   liste.
4. Il s'arrête quand la chaîne est épuisée ou après `maxAttempts`.

La capacité vision est détectée depuis les données live des fournisseurs (`attachment: true`,
`modalities.input` contenant `"image"`, ou `capabilities.input.image` en mode hérité). Rien n'est
codé en dur : la chaîne reflète toujours les fournisseurs réellement configurés et authentifiés
dans OpenCode.

## Notes de comportement

- Si un renvoi échoue lui-même (fournisseur indisponible, requête invalide), le plugin arrête de
  router cette session plutôt que de réessayer à l'aveugle.
- Les fournisseurs listés dans `preferProviders` passent toujours en premier dans la chaîne, du
  moins cher au plus cher dans le groupe. Pratique pour les offres gratuites (ex. Groq) : les
  modèles gratuits sont essayés avant tout repli payant.
- Les `session.error` concurrentes pour la même session sont dédupliquées.
- La limite `maxAttempts` s'applique par message avec image ; un nouveau message avec image
  réarme l'état « en attente ».

## Développement

```sh
npm install
npm test            # tests unitaires (vitest)
npm run typecheck   # vérification des types src + tests
npm run build       # compilation vers dist/
```

### Vérification de bout en bout

Avec le plugin chargé dans un serveur OpenCode en cours d'exécution :

```sh
OPENCODE_URL=http://127.0.0.1:10999 node scripts/e2e.mjs
```

Le script génère un PNG d'exemple, l'envoie dans une session fraîche, attend la réponse de
l'assistant et affiche quel modèle l'a traitée — vous devriez voir un modèle avec vision si votre
modèle configuré ne voit pas les images.

## Licence

MIT
