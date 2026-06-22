import { ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

/**
 * KeyboardAwareScrollView
 *
 * Drop-in replacement for ScrollView that automatically lifts content above
 * the keyboard using KeyboardAvoidingView. Use this on any screen that has
 * TextInputs that could be covered by the on-screen keyboard.
 *
 * The outer SafeAreaView is NOT included — screens keep their own SafeAreaView.
 * This wraps only the KeyboardAvoidingView + ScrollView layer.
 *
 * iOS:  behavior="padding" — shifts the scroll view up by the keyboard height.
 * Android: behavior="height" — shrinks the scroll view to fit above the keyboard.
 *
 * Usage — replace:
 *   <ScrollView contentContainerStyle={...}>
 * With:
 *   <KeyboardAwareScrollView contentContainerStyle={...}>
 */
export default function KeyboardAwareScrollView({
  children,
  style,
  contentContainerStyle,
  keyboardShouldPersistTaps = 'handled',
  ...rest
}) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={contentContainerStyle}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        {...rest}
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
