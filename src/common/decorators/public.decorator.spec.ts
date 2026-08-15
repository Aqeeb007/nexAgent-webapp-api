import { IS_PUBLIC_KEY, Public } from './public.decorator';

class TestController {
  @Public()
  testMethod() {}

  unmarkedMethod() {}
}

// Reflect.getMetadata needs the raw unbound function as its key here, so the
// unbound-method rule's usual "you probably meant to bind this" concern
// doesn't apply.
/* eslint-disable @typescript-eslint/unbound-method */
const decoratedMethod = TestController.prototype.testMethod;
const plainMethod = TestController.prototype.unmarkedMethod;
/* eslint-enable @typescript-eslint/unbound-method */

describe('Public', () => {
  it('marks the decorated method with the public metadata key', () => {
    const result = Reflect.getMetadata(IS_PUBLIC_KEY, decoratedMethod) as
      boolean | undefined;

    expect(result).toBe(true);
  });

  it('leaves an undecorated method without the metadata key', () => {
    const result = Reflect.getMetadata(IS_PUBLIC_KEY, plainMethod) as
      boolean | undefined;

    expect(result).toBeUndefined();
  });
});
