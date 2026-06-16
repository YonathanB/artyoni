Oui, c'est tout à fait faisable, et votre architecture actuelle s'y prête particulièrement bien. La raison : le composant repose sur un seul FormGroup contenant tous les champs, et un signal formValues global. Un système d'étapes ne fait que filtrer quels champs on affiche, sans toucher au modèle sous-jacent. Donc les dépendances inter-champs continuent de fonctionner même entre étapes (un champ de l'étape 3 peut dépendre d'un champ de l'étape 1).
Voici ce qu'il faudrait ajouter :
1. Le modèle — une notion de steps optionnelle dans FormConfig :
Typescript
En gardant les fields à plat et en référençant les champs par fieldKeys, on reste rétrocompatible : sans steps, le composant fonctionne exactement comme aujourd'hui.
2. Le state — un currentStep = signal(0) et un computed pour les étapes visibles (car une étape peut être masquée conditionnellement).
3. La navigation — boutons Précédent/Suivant/Soumettre, et un header de progression.
Le seul vrai point d'attention est la validation par étape : avant d'autoriser « Suivant », on ne valide que les contrôles de l'étape courante. Et il y a un piège lié au moteur de dépendances — un champ masqué (visible: false) mais marqué required bloquerait la validation. Il faut donc exclure les champs non-visibles de la validation d'étape, ce que le cache runtimeCache permet déjà de savoir.
Donc : facile sur le principe, avec une seule subtilité (validation d'étape ↔ champs masqués) qui est gérable proprement grâce à ce qui existe déjà.
Voulez-vous que je l'implémente directement dans le composant (mode stepper + validation par étape + indicateur de progression), tout en gardant la rétrocompatibilité avec le mode simple ?
https://www.linkedin.com/feed/update/urn:li:groupPost:762547-7334604298070228994?utm_source=social_share_video_v2&utm_medium=android_app&rcm=ACoAAAlfpegB9IJ80ZO5Op4qzrJciYD03KpudZM&utm_campaign=copy_link

Object.defineProperty(TooltipComponent.prototype, '_onShow', {
  configurable: true,
  enumerable: true,
  value: function() {
    // Call original _onShow implementation first
    const tooltipElement = document.querySelector('.mdc-tooltip__surface');
    if (tooltipElement) {
      tooltipElement.innerHTML = this.message;
    }
  }
});



import { Directive, OnDestroy, Renderer2, NgZone } from '@angular/core';
import { MatTooltip } from '@angular/material/tooltip';

@Directive({
  selector: '[matTooltip]',
  standalone: true,
})
export class TooltipTransformDirective implements OnDestroy {
  private originalShow: (delay?: number, origin?: { x: number; y: number; }) => void;

  constructor(
    private tooltip: MatTooltip,
    private renderer: Renderer2,
    private ngZone: NgZone
  ) {
    // Store the original show method
    this.originalShow = this.tooltip.show;
    
    // Override the show method
    this.tooltip.show = () => {
      // Call the original show method
      this.originalShow.call(this.tooltip);
      
      // Use NgZone.runOutsideAngular to handle DOM manipulation
      this.ngZone.runOutsideAngular(() => {
        setTimeout(() => {
          const tooltipElement = document.querySelector('.mdc-tooltip__surface');
          if (tooltipElement && typeof this.tooltip.message === 'string') {
            // Use Renderer2 for DOM manipulation
            this.renderer.setProperty(tooltipElement, 'innerHTML', this.tooltip.message);
          }
        });
      });
    };
  }

  ngOnDestroy() {
    // Restore original show method
    if (this.originalShow) {
      this.tooltip.show = this.originalShow;
    }
  }
}
