import { Component, ComponentInterface, Element, Event, EventEmitter, Prop, h, State, Watch } from '@stencil/core';

import { getIonMode } from '../../global/ionic-global';
import { Animation } from '../../interface';
import { getClassMap } from '../../utils/theme';
import { GestureDetail, Gesture } from '../../utils/gesture';

/*
import { iosEnterAnimation } from './animations/ios.enter';
import { iosLeaveAnimation } from './animations/ios.leave';
import { mdEnterAnimation } from './animations/md.enter';
import { mdLeaveAnimation } from './animations/md.leave';
*/

/**
 * @virtualProp {"ios" | "md"} mode - The mode determines which platform styles to use.
 */
@Component({
  tag: 'ion-drawer',
  styleUrls: {
    ios: 'drawer.ios.scss',
    md: 'drawer.md.scss'
  },
  shadow: true
})
export class Drawer implements ComponentInterface {

  presented = false;
  animation?: Animation;
  mode = getIonMode(this);
  // Animation duration
  animationDuration = 400;
  // Distance from the top
  topPadding = 20;
  height = 0;
  // Current y position of element
  y = 0;
  lastY = 0;
  gesture?: Gesture;
  scrollElement?: HTMLElement;
  shadowContentElement?: HTMLElement;
  contentHeight = 0;
  // Whether the drawer will scroll based on the content height
  canScroll = false;

  @Element() el!: HTMLElement;

  /**
   * Whether the drawer is opened.
   */
  @Prop() openTo: 'start' | 'middle' | 'end' | 'closed' = 'closed';

  /**
   * The height of the element when in its starting position
   */
  @Prop() openHeightStart?: number;

  /**
   * The height of the element when partially opened. If not set the middle position will not be used
   */
  @Prop() openHeightMiddle?: number;

  /**
   * The height of the element when fully. If not set, the height will be computed
   * and set to the height of the screen minus some padding for any top notch
   */
  @Prop() openHeightEnd?: number;

  /**
   * The max position to allow the user to open the drawer to. Set this value equal to the
   * open height in order to prevent the user from opening the drawer fully.
   *
   * Once this limit is reached, the drawer will rubber band slightly beyond it.
   */
  @Prop() maxOffset?: number;

  @State() active = false;

  /** @internal */
  @Prop() overlayIndex!: number;

  /**
   * Additional classes to apply for custom CSS. If multiple classes are
   * provided they should be separated by spaces.
   */
  @Prop() cssClass?: string | string[];

  /**
   * Emitted after the drawer has opened.
   */
  @Event({ eventName: 'ionDrawerOpen' }) didOpen!: EventEmitter<void>;

  /**
   * Emitted after the drawer has closed.
   */
  @Event({ eventName: 'ionDrawerClose' }) didClose!: EventEmitter<void>;

  async componentDidLoad() {
    const screenHeight = window.innerHeight;

    if (this.hasNotch()) {
      // Add more padding at the top for the notch
      this.topPadding = 40;
    }

    // Set the starting Y position
    const startingY = this.openTo !== 'closed' ? this.openHeightStart || this.openHeightMiddle : 0;

    console.log('Starting Y', startingY);

    this.y = startingY ? screenHeight - startingY : screenHeight + 20;

    this.sizeElement();
    this.slideTo(this.y);

    /*
    this.onPositionChange && this.onPositionChange({
      startx: 0,
      starty: 0,
      x: 0,
      y: this.y,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0
    });
    */


    // Wait a frame to enable the animation to avoid having it run on start
    requestAnimationFrame(() => {
      this.enableTransition();
    });

    this.gesture = (await import('../../utils/gesture')).createGesture({
      el: this.el,
      gestureName: 'drawerExpand',
      gesturePriority: 110,
      threshold: 0,
      direction: 'y',
      passive: true,
      disableScroll: false,
      canStart: detail => this.canStart(detail),
      onStart: detail => this.onGestureStart(detail),
      onMove: detail => this.onGestureMove(detail),
      onEnd: detail => this.onGestureEnd(detail)
    });

    this.gesture.setDisabled(false);

    this.shadowContentElement = this.el.shadowRoot!.querySelector('.drawer-slotted-content') as HTMLElement;

    // Grab the main scroll region in the provided content which will be used
    // to handle the drag detection and block dragging when the user intends
    // to scroll the content instead
    const contentEl = this.el.querySelector('ion-content') as HTMLIonContentElement;
    if (contentEl) {
      this.scrollElement = await contentEl.getScrollElement();
    }

    this.sizeElement();

    this.slideTo(this.y);
  }

  // Check if the device has a notch
  // From https://stackoverflow.com/a/48572849
  private hasNotch() {
    if (CSS.supports('padding-bottom: env(safe-area-inset-bottom)')) {
      const div = document.createElement('div');
      div.style.paddingBottom = 'env(safe-area-inset-bottom)';
      document.body.appendChild(div);
      const paddingBottomStyle = window.getComputedStyle(div).paddingBottom;
      const calculatedPadding = parseInt(paddingBottomStyle || '0', 10);
      console.log('Calculated padding', calculatedPadding);
      document.body.removeChild(div);
      if (calculatedPadding > 0) {
        return true;
      }
    }
    return false;
  }

  private sizeElement() {
    const e = this.el;

    // Size the content area, either by using the max height or by using the full screen height
    if (this.openHeightEnd) {
      this.height = this.openHeightEnd;
      this.setContentHeight(this.openHeightEnd);
    } else {
      const screenHeight = window.innerHeight;
      this.height = (screenHeight - this.topPadding);
      this.setContentHeight(this.height);
    }

    e.style.height = `${this.height}px`;
  }

  private canStart = (detail: GestureDetail): boolean => {
    const target = detail.event.target as HTMLElement;
    let n = target;
    while (n && n !== this.el) {
      if (n.tagName === 'ION-CONTENT') {
        if (this.scrollElement) {
          console.log('Can start?', this.y, this.openHeightMiddle, this.openHeightEnd, this.maxOffset);
          // If the element is scrollable then we won't allow the drag. Add an extra pixel to the clientHeight
          // to account for an extra pixel in height in content (not sure why there's an extra pixel in content scroll but it's there)
          const canOpen = !this.maxOffset || (this.openHeightMiddle && this.openHeightMiddle < this.maxOffset);
          if (!canOpen && this.scrollElement.scrollHeight > this.scrollElement.clientHeight + 1) {
            return false;
          }
        }
        return true;
      }
      n = n.parentElement as HTMLElement;
    }
    return true;
  }

  private onGestureStart = (_detail: GestureDetail) => {
    this.disableTransition();
  }

  private onGestureMove = (detail: GestureDetail) => {
    const dy = this.lastY ? detail.currentY - this.lastY : 0;

    const openedY = this.getOpenEndY();

    console.log(this.openHeightEnd, this.y < openedY);

    let isBeyond = false;
    if (this.openHeightEnd && this.maxOffset && this.y < openedY || (this.maxOffset && openedY < this.maxOffset)) {
      isBeyond = true;
    } else if (this.y <= this.topPadding) {
      isBeyond = true;
    }

    // Check if the user has dragged beyond our limit
    if (isBeyond) {
      // Grow the content area slightly
      // const screenHeight = window.innerHeight;

      const openY = this.getOpenEndY();
      const overAmount = openY - this.y;

      console.log('Over amount', overAmount);

      this.growContentHeight(overAmount);
      // When we're above the limit, let the user pull but at a
      // slower rate (to give a sense of friction)
      this.slideBy(dy * 0.3);
    } else {
      this.growContentHeight(0);
      this.slideBy(dy);
    }

    this.lastY = detail.currentY;
    // this.onPositionChange && this.onPositionChange(detail);
  }

  private onGestureEnd = (detail: GestureDetail) => {
    this.enableTransition();

    this.lastY = 0;

    console.log('End drag', detail, this.y, this.getOpenEndY());

    let opened;

    if (detail.velocityY < -0.6) {
      // User threw the drawer up, open it
      opened = true;
    } else if (detail.velocityY > 0.6) {
      // User threw the drawer down, close it
      opened = false;
    } else if (this.openHeightMiddle && this.y <= this.getOpenMiddleY()) {
      opened = true;
    } else if (this.openHeightEnd && this.y <= this.getOpenEndY()) {
      // A max open height was set and was dragged at or above it
      opened = true;
    } else if (this.openHeightEnd && this.y > this.getOpenEndY()) {
      // If they are just slightly under the max open height, don't close it,
      // otherwise, close it
      opened = this.y < (this.getOpenEndY() + 75);
    } else if (this.y > (this.getOpenEndY() + 75)) {
      opened = false;
    } else if (this.y <= this.height / 2) {
      // If they dragged more than half the screen and the other conditions didn't hit,
      // open it
      opened = true;
    } else {
      // Otherwise, close it
      opened = false;
    }

    if (opened) {
      this.slideOpenToEnd();
    } else {
      this.slideClose();
    }
  }

  private disableTransition() {
    this.el.style.transition = '';
  }

  private enableTransition() {
    this.el.style.transition = `${this.animationDuration}ms transform cubic-bezier(0.23, 1, 0.32, 1)`;
  }

  private setContentHeight(height: number) {
    if (this.shadowContentElement) {
      this.shadowContentElement.style.height = `${height}px`;
    }
  }

  private growContentHeight(by: number) {
    if (this.shadowContentElement) {
      if (this.openHeightEnd) {
        this.setContentHeight(this.openHeightEnd + by);
      } else {
        const screenHeight = window.innerHeight;
        this.setContentHeight(screenHeight + by);
      }
    }
  }

  private slideBy(dy: number) {
    this.slideTo(this.y + dy);
  }

  private slideTo(y: number) {
    this.y = y;
    this.el.style.transform = `translateY(${this.y}px) translateZ(0)`;
  }

  private slideOpenToEnd() {
    // const startY = this.y;
    // const screenHeight = window.innerHeight;
    // this.slideTo((screenHeight - this.openHeight) - this.topPadding);
    this.slideTo(this.getOpenEndY());
    this.afterTransition(() => {
      this.fireOpen();
      this.growContentHeight(0);
    });
  }

  private slideOpenToMiddle() {
    console.log('Openining partially', this.getOpenMiddleY());
    // const startY = this.y;
    // const screenHeight = window.innerHeight;
    // this.slideTo((screenHeight - this.openHeight) - this.topPadding);
    this.slideTo(this.getOpenMiddleY());
    this.afterTransition(() => {
      this.fireOpenToMiddle();
      this.growContentHeight(0);
    });
  }

  private slideOpenToStart() {
    console.log('Openining to start', this.getOpenStartY());
    // const startY = this.y;
    // const screenHeight = window.innerHeight;
    // this.slideTo((screenHeight - this.openHeight) - this.topPadding);
    this.slideTo(this.getOpenStartY());
    this.afterTransition(() => {
      this.fireOpenToStart();
      this.growContentHeight(0);
    });
  }

  private slideClose() {
    console.log('Sliding close');
    // const startY = this.y;
    const finalY = this.getClosedY();
    this.slideTo(finalY);
    this.afterTransition(() => {
      this.fireClose();
      this.growContentHeight(0);
    });
  }

  private isOpenToEnd() {
    return this.y === this.getOpenEndY();
  }

  private isOpenToMiddle() {
    return this.y === this.getOpenMiddleY();
  }

  private isOpenToStart() {
    return this.y === this.getOpenStartY();
  }

  private isClosed() {
    return this.y === this.getClosedY();
  }

  private afterTransition(fn: () => void) {
    setTimeout(fn, this.animationDuration);
  }

  private getOpenEndY() {
    if (this.openHeightEnd) {
      const screenHeight = window.innerHeight;
      return screenHeight - this.openHeightEnd;
    } else {
      return this.topPadding;
    }
  }

  private getOpenMiddleY() {
    if (this.openHeightMiddle) {
      const screenHeight = window.innerHeight;
      return screenHeight - this.openHeightMiddle;
    } else {
      return this.topPadding;
    }
  }

  private getOpenStartY() {
    if (this.openHeightStart) {
      const screenHeight = window.innerHeight;
      return screenHeight - this.openHeightStart;
    } else {
      return this.topPadding;
    }
  }

  private getClosedY() {
    const screenHeight = window.innerHeight;

    return screenHeight + 20;
  }

  private fireToggled(isOpened: boolean, _finalY: number) {
    if (isOpened) {
      this.didOpen.emit();
    } else {
      this.didClose.emit();
    }
  }

  private fireOpen() {
    this.fireToggled(true, this.getOpenEndY());
  }

  private fireOpenToMiddle() {
    this.fireToggled(true, this.getOpenMiddleY());
  }

  private fireOpenToStart() {
    this.fireToggled(true, this.getOpenStartY());
  }

  private fireClose() {
    this.fireToggled(false, this.getClosedY());
  }

  @Watch('openTo')
  handleOpenedChange() {
    if (this.openTo === 'end' && !this.isOpenToEnd()) {
      this.slideOpenToEnd();
    } else if (this.openTo === 'middle' && !this.isOpenToMiddle()) {
      this.slideOpenToMiddle();
    } else if (this.openTo === 'start' && !this.isOpenToStart()) {
      this.slideOpenToStart();
    } else if (this.openTo === 'closed' && !this.isClosed()) {
      this.slideClose();
    }
  }

  hostData() {
    const mode = getIonMode(this);

    return {
      'role': 'dialog',
      'aria-modal': 'true',
      style: {
        zIndex: 20000 + this.overlayIndex,
      },
      class: {
        [mode]: true,

        ...getClassMap(this.cssClass)
      }
    };
  }

  render() {
    // const mode = getIonMode(this);

    return [
      <div class="drawer-wrapper" role="dialog">
        <div class="drawer-content">
          <div class="drawer-lip">
            <div class="drawer-lip-icon"></div>
          </div>
          <div class="drawer-slotted-content">
            <slot />
          </div>
        </div>
      </div>
    ];
  }
}