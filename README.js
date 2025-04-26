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
