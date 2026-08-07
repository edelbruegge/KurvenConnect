import { Keyboard, Platform } from 'react-native';

/**
 * The "tap outside to close the keyboard" idiom used by every form screen. On iOS/Android this is
 * exactly `Keyboard.dismiss()`. On web it must be a no-op: react-native-web implements
 * `Keyboard.dismiss()` by blurring whatever element currently has focus
 * (react-native-web/src/modules/dismissKeyboard), and because a click on a nested TextInput
 * bubbles up through the DOM to the same wrapping Pressable's onPress just like any other click,
 * calling the native dismiss here would immediately blur the input the user just focused — on
 * every click into a field, not just clicks genuinely outside it. There is no virtual keyboard
 * overlay to dismiss on web in the first place.
 */
export function dismissKeyboardOnNative(): void {
  if (Platform.OS !== 'web') {
    Keyboard.dismiss();
  }
}
