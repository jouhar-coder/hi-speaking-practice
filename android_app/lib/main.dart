import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:http/http.dart' as http;
import 'package:speech_to_text/speech_to_text.dart' as stt;

// Keep this pointed at your deployed backend. The server needs OPENAI_API_KEY set.
const String apiBaseUrl = 'https://hi-speaking-practice.onrender.com';

void main() => runApp(const HiSpeakingApp());

class LanguageOption {
  const LanguageOption(this.id, this.name, this.flag, this.locale);
  final String id;
  final String name;
  final String flag;
  final String locale;
}

const languages = <LanguageOption>[
  LanguageOption('en', 'English', '🇬🇧', 'en-US'),
  LanguageOption('ml', 'Malayalam', '🇮🇳', 'ml-IN'),
  LanguageOption('fr', 'French', '🇫🇷', 'fr-FR'),
  LanguageOption('de', 'German', '🇩🇪', 'de-DE'),
  LanguageOption('ar', 'Arabic', '🇸🇦', 'ar-SA'),
  LanguageOption('hi', 'Hindi', '🇮🇳', 'hi-IN'),
  LanguageOption('ja', 'Japanese', '🇯🇵', 'ja-JP'),
  LanguageOption('es', 'Spanish', '🇪🇸', 'es-ES'),
  LanguageOption('it', 'Italian', '🇮🇹', 'it-IT'),
  LanguageOption('ko', 'Korean', '🇰🇷', 'ko-KR'),
];

class HiSpeakingApp extends StatelessWidget {
  const HiSpeakingApp({super.key});

  @override
  Widget build(BuildContext context) {
    const forest = Color(0xFF20382B);
    const lime = Color(0xFFB9E879);
    return MaterialApp(
      title: 'hi — Speaking Coach',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        scaffoldBackgroundColor: const Color(0xFFF7F5ED),
        colorScheme: ColorScheme.fromSeed(seedColor: forest, primary: forest, secondary: lime),
        appBarTheme: const AppBarTheme(backgroundColor: Color(0xFFF7F5ED), foregroundColor: forest),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide.none),
          contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        ),
      ),
      home: const ConversationPage(),
    );
  }
}

class ChatMessage {
  const ChatMessage({required this.text, required this.isUser});
  final String text;
  final bool isUser;
}

class ConversationPage extends StatefulWidget {
  const ConversationPage({super.key});

  @override
  State<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends State<ConversationPage> {
  final stt.SpeechToText _speech = stt.SpeechToText();
  final FlutterTts _tts = FlutterTts();
  final TextEditingController _textController = TextEditingController();
  final ScrollController _scrollController = ScrollController();
  final List<ChatMessage> _messages = [];
  LanguageOption _learningLanguage = languages[1];
  LanguageOption _nativeLanguage = languages[0];
  String _level = 'Beginner';
  String _partialText = '';
  String _status = 'Choose a language and start speaking.';
  bool _speechAvailable = false;
  bool _listening = false;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _initializeSpeech();
  }

  Future<void> _initializeSpeech() async {
    try {
      final available = await _speech.initialize(
        onStatus: (status) {
          if (!mounted) return;
          setState(() => _listening = status == 'listening');
        },
        onError: (error) {
          if (!mounted) return;
          setState(() => _status = 'Microphone error: ${error.errorMsg}. Check permissions and language support.');
        },
      );
      if (!mounted) return;
      setState(() {
        _speechAvailable = available;
        if (!available) _status = 'Speech recognition is unavailable on this device.';
      });
    } catch (_) {
      if (!mounted) return;
      setState(() => _status = 'Could not start speech recognition. Check microphone permissions.');
    }
  }

  Future<void> _toggleListening() async {
    if (_sending) return;
    if (_listening) {
      await _speech.stop();
      return;
    }
    if (!_speechAvailable) {
      await _initializeSpeech();
      if (!_speechAvailable) return;
    }
    setState(() {
      _partialText = '';
      _status = 'Listening in ${_learningLanguage.name}…';
    });
    try {
      await _speech.listen(
        localeId: _learningLanguage.locale,
        listenFor: const Duration(seconds: 45),
        pauseFor: const Duration(seconds: 3),
        onResult: (result) {
          if (!mounted) return;
          setState(() => _partialText = result.recognizedWords);
          if (result.finalResult && result.recognizedWords.trim().isNotEmpty) {
            _speech.stop();
            _sendMessage(result.recognizedWords.trim());
          }
        },
      );
    } catch (_) {
      if (!mounted) return;
      setState(() => _status = 'Could not start the microphone. Check the Android permission.');
    }
  }

  Future<void> _sendTypedMessage() async {
    final text = _textController.text.trim();
    if (text.isEmpty || _sending) return;
    _textController.clear();
    await _sendMessage(text);
  }

  Future<void> _sendMessage(String text) async {
    if (_sending) return;
    setState(() {
      _sending = true;
      _partialText = '';
      _messages.add(ChatMessage(text: text, isUser: true));
      _status = 'Your speaking partner is thinking…';
    });
    _scrollToBottom();

    final history = _messages.length > 12 ? _messages.sublist(_messages.length - 12) : _messages;
    try {
      final response = await http
          .post(
            Uri.parse('$apiBaseUrl/api/chat'),
            headers: const {'Content-Type': 'application/json'},
            body: jsonEncode({
              'languageId': _learningLanguage.id,
              'nativeLanguageId': _nativeLanguage.id,
              'level': _level,
              'scenario': 'friendly everyday conversation',
              'messages': history.map((message) => {
                'role': message.isUser ? 'user' : 'assistant',
                'content': message.text,
              }).toList(),
            }),
          )
          .timeout(const Duration(seconds: 35));

      final data = jsonDecode(response.body) as Map<String, dynamic>;
      if (response.statusCode < 200 || response.statusCode >= 300) {
        throw Exception(data['error']?.toString() ?? 'The AI could not reply. Try again.');
      }
      final reply = data['reply']?.toString().trim() ?? '';
      if (reply.isEmpty) throw Exception('The AI returned an empty reply.');
      if (!mounted) return;
      setState(() {
        _messages.add(ChatMessage(text: reply, isUser: false));
        _status = 'Reply in ${_learningLanguage.name}. Keep the conversation going!';
      });
      await _speak(reply);
    } catch (error) {
      if (!mounted) return;
      setState(() => _status = error.toString().replaceFirst('Exception: ', ''));
    } finally {
      if (mounted) {
        setState(() => _sending = false);
        _scrollToBottom();
      }
    }
  }

  Future<void> _speak(String text) async {
    try {
      await _tts.stop();
      await _tts.setLanguage(_learningLanguage.locale);
      await _tts.setSpeechRate(0.43);
      await _tts.speak(text);
    } catch (_) {
      if (mounted) setState(() => _status = 'Reply is ready to read. This device may not have a voice for ${_learningLanguage.name}.');
    }
  }

  void _changeLearningLanguage(LanguageOption? language) {
    if (language == null) return;
    _speech.stop();
    _tts.stop();
    setState(() {
      _learningLanguage = language;
      _messages.clear();
      _partialText = '';
      _status = 'Ready to practise ${language.name}. Start a new conversation.';
    });
  }

  void _scrollToBottom() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(
          _scrollController.position.maxScrollExtent,
          duration: const Duration(milliseconds: 250),
          curve: Curves.easeOut,
        );
      }
    });
  }

  @override
  void dispose() {
    _speech.stop();
    _tts.stop();
    _textController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    const forest = Color(0xFF20382B);
    const muted = Color(0xFF68776D);
    return Scaffold(
      appBar: AppBar(
        title: const Row(
          children: [
            Text('h', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 29)),
            Text('i', style: TextStyle(fontWeight: FontWeight.w900, fontSize: 29, color: Color(0xFF77B83A))),
            SizedBox(width: 10),
            Text('Speaking Coach', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
          ],
        ),
        actions: [
          IconButton(
            tooltip: 'Clear conversation',
            onPressed: _sending ? null : () => setState(() {
              _messages.clear();
              _partialText = '';
              _status = 'Conversation cleared. Start speaking whenever you are ready.';
            }),
            icon: const Icon(Icons.refresh_rounded),
          ),
        ],
      ),
      body: SafeArea(
        child: Column(
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 4, 16, 12),
              child: Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(color: forest, borderRadius: BorderRadius.circular(22)),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('YOUR NEXT CONVERSATION', style: TextStyle(color: Color(0xFFB9E879), fontSize: 10, letterSpacing: 1.4, fontWeight: FontWeight.w700)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _languageDropdown('I speak', _nativeLanguage, (value) => setState(() => _nativeLanguage = value!), light: true)),
                        const SizedBox(width: 10),
                        Expanded(child: _languageDropdown('I want to learn', _learningLanguage, _changeLearningLanguage, light: true)),
                      ],
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        const Text('My level', style: TextStyle(color: Colors.white70, fontSize: 12)),
                        const SizedBox(width: 12),
                        DropdownButton<String>(
                          value: _level,
                          dropdownColor: forest,
                          style: const TextStyle(color: Colors.white, fontSize: 13),
                          underline: const SizedBox.shrink(),
                          items: const ['Beginner', 'Intermediate', 'Advanced'].map((value) => DropdownMenuItem(value: value, child: Text(value))).toList(),
                          onChanged: (value) => setState(() => _level = value ?? 'Beginner'),
                        ),
                        const Spacer(),
                        const Icon(Icons.graphic_eq_rounded, color: Color(0xFFB9E879)),
                        const SizedBox(width: 5),
                        const Text('Voice-first practice', style: TextStyle(color: Colors.white70, fontSize: 11)),
                      ],
                    ),
                  ],
                ),
              ),
            ),
            Expanded(
              child: _messages.isEmpty
                  ? Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Container(
                              width: 88,
                              height: 88,
                              decoration: const BoxDecoration(color: Color(0xFFE4F4CC), shape: BoxShape.circle),
                              child: const Icon(Icons.forum_rounded, size: 39, color: forest),
                            ),
                            const SizedBox(height: 20),
                            const Text('Let’s start talking.', style: TextStyle(fontSize: 25, fontWeight: FontWeight.w800, color: forest)),
                            const SizedBox(height: 8),
                            const Text('Speak naturally. Your AI partner will answer in the language you are learning.', textAlign: TextAlign.center, style: TextStyle(color: muted, height: 1.45)),
                            const SizedBox(height: 16),
                            Wrap(
                              alignment: WrapAlignment.center,
                              spacing: 8,
                              runSpacing: 8,
                              children: ['Introduce yourself', 'Travel', 'Everyday life'].map((item) => Chip(label: Text(item), backgroundColor: Colors.white, side: BorderSide.none)).toList(),
                            ),
                          ],
                        ),
                      ),
                    )
                  : ListView.builder(
                      controller: _scrollController,
                      padding: const EdgeInsets.fromLTRB(16, 6, 16, 18),
                      itemCount: _messages.length,
                      itemBuilder: (context, index) {
                        final message = _messages[index];
                        return Align(
                          alignment: message.isUser ? Alignment.centerRight : Alignment.centerLeft,
                          child: Container(
                            constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * .82),
                            margin: const EdgeInsets.only(bottom: 10),
                            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 12),
                            decoration: BoxDecoration(
                              color: message.isUser ? const Color(0xFFDDF3C9) : Colors.white,
                              borderRadius: BorderRadius.only(
                                topLeft: const Radius.circular(17),
                                topRight: const Radius.circular(17),
                                bottomLeft: Radius.circular(message.isUser ? 17 : 4),
                                bottomRight: Radius.circular(message.isUser ? 4 : 17),
                              ),
                            ),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(message.text, style: const TextStyle(fontSize: 15, height: 1.45)),
                                if (!message.isUser)
                                  Align(
                                    alignment: Alignment.centerRight,
                                    child: IconButton(
                                      visualDensity: VisualDensity.compact,
                                      tooltip: 'Play reply',
                                      onPressed: () => _speak(message.text),
                                      icon: const Icon(Icons.volume_up_rounded, size: 19, color: forest),
                                    ),
                                  ),
                              ],
                            ),
                          ),
                        );
                      },
                    ),
            ),
            if (_partialText.isNotEmpty)
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 4),
                child: Text('Hearing: $_partialText', style: const TextStyle(color: muted, fontSize: 12)),
              ),
            Container(
              padding: const EdgeInsets.fromLTRB(16, 10, 16, 14),
              decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFE1E7DD)))),
              child: Column(
                children: [
                  Text(_status, maxLines: 2, textAlign: TextAlign.center, style: const TextStyle(color: muted, fontSize: 12)),
                  const SizedBox(height: 10),
                  Row(
                    children: [
                      Expanded(
                        child: TextField(
                          controller: _textController,
                          textInputAction: TextInputAction.send,
                          onSubmitted: (_) => _sendTypedMessage(),
                          decoration: const InputDecoration(hintText: 'Or type a message…', isDense: true),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _sending ? null : _sendTypedMessage,
                        icon: const Icon(Icons.send_rounded),
                        style: IconButton.styleFrom(backgroundColor: forest, foregroundColor: Colors.white),
                      ),
                      const SizedBox(width: 8),
                      SizedBox(
                        width: 52,
                        height: 52,
                        child: FilledButton(
                          onPressed: _sending ? null : _toggleListening,
                          style: FilledButton.styleFrom(
                            backgroundColor: _listening ? const Color(0xFFE98977) : const Color(0xFFB9E879),
                            foregroundColor: forest,
                            shape: const CircleBorder(),
                            padding: EdgeInsets.zero,
                          ),
                          child: _sending
                              ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
                              : Icon(_listening ? Icons.stop_rounded : Icons.mic_rounded, size: 25),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _languageDropdown(String label, LanguageOption selected, ValueChanged<LanguageOption?> onChanged, {required bool light}) {
    final foreground = light ? Colors.white : const Color(0xFF20382B);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: TextStyle(color: light ? Colors.white70 : Colors.black54, fontSize: 10)),
        const SizedBox(height: 5),
        DropdownButtonHideUnderline(
          child: DropdownButton<LanguageOption>(
            value: selected,
            isExpanded: true,
            dropdownColor: const Color(0xFF20382B),
            iconEnabledColor: light ? const Color(0xFFB9E879) : foreground,
            style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w700),
            selectedItemBuilder: (context) => languages.map((language) => Align(
              alignment: Alignment.centerLeft,
              child: Text('${language.flag} ${language.name}', maxLines: 1, overflow: TextOverflow.ellipsis, style: TextStyle(color: foreground, fontSize: 12, fontWeight: FontWeight.w700)),
            )).toList(),
            items: languages.map((language) => DropdownMenuItem(
              value: language,
              child: Text('${language.flag} ${language.name}', style: const TextStyle(color: Colors.white, fontSize: 13)),
            )).toList(),
            onChanged: onChanged,
          ),
        ),
      ],
    );
  }
}
