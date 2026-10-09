#include <algorithm>
#include <cctype>
#include <cmath>
#include <ctime>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <map>
#include <regex>
#include <set>
#include <sstream>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

class Json {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };

    Type type = Type::Null;
    bool bool_value = false;
    double number_value = 0.0;
    std::string string_value;
    std::vector<Json> array_value;
    std::map<std::string, Json> object_value;

    Json() = default;
    static Json make_bool(bool value) {
        Json json;
        json.type = Type::Bool;
        json.bool_value = value;
        return json;
    }
    static Json make_number(double value) {
        Json json;
        json.type = Type::Number;
        json.number_value = value;
        return json;
    }
    static Json make_string(std::string value) {
        Json json;
        json.type = Type::String;
        json.string_value = std::move(value);
        return json;
    }
    static Json make_array(std::vector<Json> value) {
        Json json;
        json.type = Type::Array;
        json.array_value = std::move(value);
        return json;
    }
    static Json make_object(std::map<std::string, Json> value) {
        Json json;
        json.type = Type::Object;
        json.object_value = std::move(value);
        return json;
    }

    bool is_null() const { return type == Type::Null; }
    bool is_bool() const { return type == Type::Bool; }
    bool is_number() const { return type == Type::Number; }
    bool is_string() const { return type == Type::String; }
    bool is_array() const { return type == Type::Array; }
    bool is_object() const { return type == Type::Object; }

    bool has(const std::string &key) const {
        return is_object() && object_value.find(key) != object_value.end();
    }

    const Json &at(const std::string &key) const {
        static Json null_json;
        if (!is_object()) {
            return null_json;
        }
        auto it = object_value.find(key);
        return it == object_value.end() ? null_json : it->second;
    }

    Json &operator[](const std::string &key) {
        if (!is_object()) {
            type = Type::Object;
            object_value.clear();
        }
        return object_value[key];
    }

    std::string as_string(const std::string &fallback = "") const {
        if (is_string()) {
            return string_value;
        }
        if (is_bool()) {
            return bool_value ? "true" : "false";
        }
        if (is_number()) {
            std::ostringstream oss;
            oss << number_value;
            return oss.str();
        }
        return fallback;
    }

    bool as_bool(bool fallback = false) const {
        if (is_bool()) {
            return bool_value;
        }
        if (is_number()) {
            return std::fabs(number_value) > 1e-9;
        }
        if (is_string()) {
            return string_value == "true" || string_value == "1";
        }
        return fallback;
    }

    double as_number(double fallback = 0.0) const {
        if (is_number()) {
            return number_value;
        }
        if (is_bool()) {
            return bool_value ? 1.0 : 0.0;
        }
        if (is_string()) {
            try {
                return std::stod(string_value);
            } catch (...) {
                return fallback;
            }
        }
        return fallback;
    }
};

class JsonParser {
public:
    explicit JsonParser(std::string text) : text_(std::move(text)) {}

    Json parse() {
        skip_ws();
        Json value = parse_value();
        skip_ws();
        if (pos_ != text_.size()) {
            throw std::runtime_error("Unexpected trailing JSON content");
        }
        return value;
    }

private:
    std::string text_;
    size_t pos_ = 0;

    void skip_ws() {
        while (pos_ < text_.size() && std::isspace(static_cast<unsigned char>(text_[pos_]))) {
            ++pos_;
        }
    }

    char peek() const {
        return pos_ < text_.size() ? text_[pos_] : '\0';
    }

    char get() {
        if (pos_ >= text_.size()) {
            throw std::runtime_error("Unexpected end of JSON input");
        }
        return text_[pos_++];
    }

    void expect(char ch) {
        if (get() != ch) {
            throw std::runtime_error(std::string("Expected character: ") + ch);
        }
    }

    Json parse_value() {
        skip_ws();
        char ch = peek();
        if (ch == '{') return parse_object();
        if (ch == '[') return parse_array();
        if (ch == '"') return Json::make_string(parse_string());
        if (ch == 't') return parse_true();
        if (ch == 'f') return parse_false();
        if (ch == 'n') return parse_null();
        if (ch == '-' || std::isdigit(static_cast<unsigned char>(ch))) return parse_number();
        throw std::runtime_error("Invalid JSON value");
    }

    Json parse_object() {
        expect('{');
        skip_ws();
        std::map<std::string, Json> object;
        if (peek() == '}') {
            get();
            return Json::make_object(std::move(object));
        }
        while (true) {
            skip_ws();
            std::string key = parse_string();
            skip_ws();
            expect(':');
            skip_ws();
            object[key] = parse_value();
            skip_ws();
            char ch = get();
            if (ch == '}') break;
            if (ch != ',') {
                throw std::runtime_error("Expected ',' or '}' in object");
            }
        }
        return Json::make_object(std::move(object));
    }

    Json parse_array() {
        expect('[');
        skip_ws();
        std::vector<Json> array;
        if (peek() == ']') {
            get();
            return Json::make_array(std::move(array));
        }
        while (true) {
            skip_ws();
            array.push_back(parse_value());
            skip_ws();
            char ch = get();
            if (ch == ']') break;
            if (ch != ',') {
                throw std::runtime_error("Expected ',' or ']' in array");
            }
        }
        return Json::make_array(std::move(array));
    }

    std::string parse_string() {
        expect('"');
        std::string result;
        while (true) {
            char ch = get();
            if (ch == '"') {
                break;
            }
            if (ch == '\\') {
                char esc = get();
                switch (esc) {
                    case '"': result.push_back('"'); break;
                    case '\\': result.push_back('\\'); break;
                    case '/': result.push_back('/'); break;
                    case 'b': result.push_back('\b'); break;
                    case 'f': result.push_back('\f'); break;
                    case 'n': result.push_back('\n'); break;
                    case 'r': result.push_back('\r'); break;
                    case 't': result.push_back('\t'); break;
                    case 'u': {
                        // Keep unicode escapes as-is in ASCII-safe form.
                        result += "\\u";
                        for (int i = 0; i < 4; ++i) {
                            result.push_back(get());
                        }
                        break;
                    }
                    default:
                        throw std::runtime_error("Unsupported JSON escape");
                }
            } else {
                result.push_back(ch);
            }
        }
        return result;
    }

    Json parse_true() {
        if (text_.substr(pos_, 4) != "true") {
            throw std::runtime_error("Invalid token, expected true");
        }
        pos_ += 4;
        return Json::make_bool(true);
    }

    Json parse_false() {
        if (text_.substr(pos_, 5) != "false") {
            throw std::runtime_error("Invalid token, expected false");
        }
        pos_ += 5;
        return Json::make_bool(false);
    }

    Json parse_null() {
        if (text_.substr(pos_, 4) != "null") {
            throw std::runtime_error("Invalid token, expected null");
        }
        pos_ += 4;
        return Json();
    }

    Json parse_number() {
        size_t start = pos_;
        if (peek() == '-') ++pos_;
        while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
        if (peek() == '.') {
            ++pos_;
            while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
        }
        if (peek() == 'e' || peek() == 'E') {
            ++pos_;
            if (peek() == '+' || peek() == '-') ++pos_;
            while (std::isdigit(static_cast<unsigned char>(peek()))) ++pos_;
        }
        return Json::make_number(std::stod(text_.substr(start, pos_ - start)));
    }
};

static std::string read_file(const std::string &path) {
    std::ifstream input(path);
    if (!input) {
        throw std::runtime_error("Failed to open file: " + path);
    }
    std::ostringstream buffer;
    buffer << input.rdbuf();
    return buffer.str();
}

static void write_file(const std::string &path, const std::string &content) {
    std::ofstream output(path);
    if (!output) {
        throw std::runtime_error("Failed to write file: " + path);
    }
    output << content;
}

static std::string escape_json(const std::string &value) {
    std::string out;
    for (char ch : value) {
        switch (ch) {
            case '\\': out += "\\\\"; break;
            case '"': out += "\\\""; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out.push_back(ch); break;
        }
    }
    return out;
}

static std::string json_to_string(const Json &json);

static std::string array_to_string(const std::vector<Json> &array) {
    std::ostringstream oss;
    oss << "[";
    for (size_t i = 0; i < array.size(); ++i) {
        if (i) oss << ",";
        oss << json_to_string(array[i]);
    }
    oss << "]";
    return oss.str();
}

static std::string object_to_string(const std::map<std::string, Json> &object) {
    std::ostringstream oss;
    oss << "{";
    bool first = true;
    for (const auto &entry : object) {
        if (!first) oss << ",";
        first = false;
        oss << "\"" << escape_json(entry.first) << "\":" << json_to_string(entry.second);
    }
    oss << "}";
    return oss.str();
}

static std::string json_to_string(const Json &json) {
    switch (json.type) {
        case Json::Type::Null:
            return "null";
        case Json::Type::Bool:
            return json.bool_value ? "true" : "false";
        case Json::Type::Number: {
            std::ostringstream oss;
            oss << json.number_value;
            return oss.str();
        }
        case Json::Type::String:
            return "\"" + escape_json(json.string_value) + "\"";
        case Json::Type::Array:
            return array_to_string(json.array_value);
        case Json::Type::Object:
            return object_to_string(json.object_value);
    }
    return "null";
}

static std::string to_lower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char ch) {
        return static_cast<char>(std::tolower(ch));
    });
    return value;
}

static std::string trim(std::string value) {
    auto not_space = [](unsigned char ch) { return !std::isspace(ch); };
    value.erase(value.begin(), std::find_if(value.begin(), value.end(), not_space));
    value.erase(std::find_if(value.rbegin(), value.rend(), not_space).base(), value.end());
    return value;
}

static std::string parent_dir(const std::string &path) {
    size_t pos = path.find_last_of('/');
    if (pos == std::string::npos) {
        return ".";
    }
    if (pos == 0) {
        return "/";
    }
    return path.substr(0, pos);
}

static std::string join_path(const std::string &left, const std::string &right) {
    if (left.empty()) return right;
    if (left.back() == '/') return left + right;
    return left + "/" + right;
}

static Json merge_objects(Json base, const std::map<std::string, Json> &extra) {
    if (!base.is_object()) {
        base = Json::make_object({});
    }
    for (const auto &entry : extra) {
        base.object_value[entry.first] = entry.second;
    }
    return base;
}

static bool file_exists(const std::string &path) {
    std::ifstream input(path);
    return static_cast<bool>(input);
}

static std::string extract_json_block(const std::string &text) {
    bool in_string = false;
    bool escaping = false;
    int depth = 0;
    size_t start = std::string::npos;
    char opening = '\0';
    char closing = '\0';

    for (size_t i = 0; i < text.size(); ++i) {
        char ch = text[i];
        if (start == std::string::npos) {
            if (ch == '{' || ch == '[') {
                start = i;
                opening = ch;
                closing = ch == '{' ? '}' : ']';
                depth = 1;
                in_string = false;
                escaping = false;
            }
            continue;
        }

        if (in_string) {
            if (escaping) {
                escaping = false;
            } else if (ch == '\\') {
                escaping = true;
            } else if (ch == '"') {
                in_string = false;
            }
            continue;
        }

        if (ch == '"') {
            in_string = true;
            continue;
        }
        if (ch == opening) {
            ++depth;
        } else if (ch == closing) {
            --depth;
            if (depth == 0) {
                return text.substr(start, i - start + 1);
            }
        }
    }
    return "";
}

static Json parse_json_block_or_null(const std::string &text) {
    std::string candidate = trim(text);
    if (candidate.empty()) {
        return Json();
    }
    std::vector<std::string> candidates;
    std::string extracted = extract_json_block(candidate);
    if (!extracted.empty()) {
        candidates.push_back(extracted);
    }

    size_t code_fence = candidate.rfind("```json");
    if (code_fence != std::string::npos) {
        size_t block_start = candidate.find('{', code_fence);
        if (block_start != std::string::npos) {
            std::string fenced = extract_json_block(candidate.substr(block_start));
            if (!fenced.empty()) {
                candidates.insert(candidates.begin(), fenced);
            }
        }
    }

    for (const auto &candidate_json : candidates) {
        try {
            Json parsed = JsonParser(candidate_json).parse();
            if (parsed.is_object() && parsed.has("actions")) {
                return parsed;
            }
            if (parsed.is_array()) {
                return parsed;
            }
        } catch (...) {
            continue;
        }
    }
    return Json();
}

static std::string extract_tag_content(const std::string &text, const std::string &tag_name) {
    std::string open_tag = "<" + tag_name + ">";
    std::string close_tag = "</" + tag_name + ">";
    size_t close_pos = text.rfind(close_tag);
    if (close_pos == std::string::npos) {
        return "";
    }
    size_t open_pos = text.rfind(open_tag, close_pos);
    if (open_pos == std::string::npos) {
        return "";
    }
    size_t content_start = open_pos + open_tag.size();
    if (content_start > close_pos) {
        return "";
    }
    return trim(text.substr(content_start, close_pos - content_start));
}

static bool parse_action_or_not_value(const std::string &raw_value, bool fallback = false) {
    std::string value = to_lower(trim(raw_value));
    if (value == "1" || value == "true" || value == "yes") {
        return true;
    }
    if (value == "0" || value == "false" || value == "no") {
        return false;
    }
    return fallback;
}

static int clamp_int(int value, int min_value, int max_value) {
    return std::max(min_value, std::min(max_value, value));
}

static bool regex_extract_int(const std::string &text, const std::string &pattern, int &value, bool case_insensitive = true) {
    std::regex::flag_type flags = std::regex::ECMAScript;
    if (case_insensitive) {
        flags |= std::regex::icase;
    }
    std::smatch match;
    if (!std::regex_search(text, match, std::regex(pattern, flags))) {
        return false;
    }
    if (match.size() < 2) {
        return false;
    }
    try {
        value = std::stoi(match[1].str());
        return true;
    } catch (...) {
        return false;
    }
}

static Json get_path_value(const Json &root, const std::string &path) {
    if (path.empty()) return Json();
    const Json *current = &root;
    std::string normalized = path;
    if (normalized.rfind("input.", 0) == 0) {
        normalized = normalized.substr(6);
    }
    if (normalized == "input") {
        return root;
    }

    size_t start = 0;
    while (start < normalized.size()) {
        size_t dot = normalized.find('.', start);
        std::string key = normalized.substr(start, dot == std::string::npos ? std::string::npos : dot - start);
        if (!current->is_object()) {
            return Json();
        }
        auto it = current->object_value.find(key);
        if (it == current->object_value.end()) {
            return Json();
        }
        current = &it->second;
        if (dot == std::string::npos) {
            break;
        }
        start = dot + 1;
    }
    return *current;
}

struct Token {
    enum class Type { Identifier, String, Number, Boolean, Operator, LParen, RParen, End };
    Type type = Type::End;
    std::string text;
};

class ConditionTokenizer {
public:
    explicit ConditionTokenizer(std::string text) : text_(std::move(text)) {}

    std::vector<Token> tokenize() {
        std::vector<Token> tokens;
        while (pos_ < text_.size()) {
            char ch = text_[pos_];
            if (std::isspace(static_cast<unsigned char>(ch))) {
                ++pos_;
                continue;
            }
            if (std::isalpha(static_cast<unsigned char>(ch)) || ch == '_') {
                tokens.push_back(read_identifier());
                continue;
            }
            if (std::isdigit(static_cast<unsigned char>(ch)) || ch == '-') {
                tokens.push_back(read_number());
                continue;
            }
            if (ch == '"') {
                tokens.push_back(read_string());
                continue;
            }
            if (ch == '(') {
                ++pos_;
                tokens.push_back({Token::Type::LParen, "("});
                continue;
            }
            if (ch == ')') {
                ++pos_;
                tokens.push_back({Token::Type::RParen, ")"});
                continue;
            }
            std::string op = read_operator();
            tokens.push_back({Token::Type::Operator, op});
        }
        tokens.push_back({Token::Type::End, ""});
        return tokens;
    }

private:
    std::string text_;
    size_t pos_ = 0;

    Token read_identifier() {
        size_t start = pos_;
        while (pos_ < text_.size()) {
            char ch = text_[pos_];
            if (std::isalnum(static_cast<unsigned char>(ch)) || ch == '_' || ch == '.') {
                ++pos_;
            } else {
                break;
            }
        }
        std::string value = text_.substr(start, pos_ - start);
        if (value == "true" || value == "false") {
            return {Token::Type::Boolean, value};
        }
        if (value == "and") {
            return {Token::Type::Operator, "&&"};
        }
        if (value == "or") {
            return {Token::Type::Operator, "||"};
        }
        return {Token::Type::Identifier, value};
    }

    Token read_number() {
        size_t start = pos_;
        if (text_[pos_] == '-') ++pos_;
        while (pos_ < text_.size() && std::isdigit(static_cast<unsigned char>(text_[pos_]))) ++pos_;
        if (pos_ < text_.size() && text_[pos_] == '.') {
            ++pos_;
            while (pos_ < text_.size() && std::isdigit(static_cast<unsigned char>(text_[pos_]))) ++pos_;
        }
        return {Token::Type::Number, text_.substr(start, pos_ - start)};
    }

    Token read_string() {
        ++pos_;
        std::string value;
        while (pos_ < text_.size()) {
            char ch = text_[pos_++];
            if (ch == '"') break;
            if (ch == '\\' && pos_ < text_.size()) {
                value.push_back(text_[pos_++]);
            } else {
                value.push_back(ch);
            }
        }
        return {Token::Type::String, value};
    }

    std::string read_operator() {
        static const std::vector<std::string> operators = {"===", "==", "!=", ">=", "<=", "&&", "||", ">", "<", "!"};
        for (const auto &op : operators) {
            if (text_.compare(pos_, op.size(), op) == 0) {
                pos_ += op.size();
                return op == "===" ? "==" : op;
            }
        }
        throw std::runtime_error("Unsupported operator in condition");
    }
};

static bool json_truthy(const Json &value) {
    if (value.is_bool()) return value.bool_value;
    if (value.is_number()) return std::fabs(value.number_value) > 1e-9;
    if (value.is_string()) return !value.string_value.empty();
    if (value.is_array()) return !value.array_value.empty();
    if (value.is_object()) return !value.object_value.empty();
    return false;
}

static bool json_equal(const Json &left, const Json &right) {
    if (left.type == right.type) {
        if (left.is_null()) return true;
        if (left.is_bool()) return left.bool_value == right.bool_value;
        if (left.is_number()) return std::fabs(left.number_value - right.number_value) < 1e-9;
        if (left.is_string()) return left.string_value == right.string_value;
        return json_to_string(left) == json_to_string(right);
    }
    if ((left.is_number() || left.is_bool() || left.is_string()) &&
        (right.is_number() || right.is_bool() || right.is_string())) {
        return left.as_string() == right.as_string();
    }
    return false;
}

class ConditionParser {
public:
    ConditionParser(std::vector<Token> tokens, Json input) : tokens_(std::move(tokens)), input_(std::move(input)) {}

    bool parse_expression() { return parse_or(); }

private:
    std::vector<Token> tokens_;
    Json input_;
    size_t pos_ = 0;

    const Token &peek() const { return tokens_[pos_]; }
    const Token &get() { return tokens_[pos_++]; }

    bool match_operator(const std::string &op) {
        if (peek().type == Token::Type::Operator && peek().text == op) {
            ++pos_;
            return true;
        }
        return false;
    }

    bool parse_or() {
        bool value = parse_and();
        while (match_operator("||")) {
            value = value || parse_and();
        }
        return value;
    }

    bool parse_and() {
        bool value = parse_unary();
        while (match_operator("&&")) {
            value = value && parse_unary();
        }
        return value;
    }

    bool parse_unary() {
        if (match_operator("!")) {
            return !parse_unary();
        }
        if (peek().type == Token::Type::LParen) {
            get();
            bool value = parse_or();
            if (peek().type != Token::Type::RParen) {
                throw std::runtime_error("Missing ')' in condition");
            }
            get();
            return value;
        }
        return parse_comparison();
    }

    Json parse_value_token() {
        Token token = get();
        switch (token.type) {
            case Token::Type::Identifier:
                return get_path_value(input_, token.text);
            case Token::Type::String:
                return Json::make_string(token.text);
            case Token::Type::Number:
                return Json::make_number(std::stod(token.text));
            case Token::Type::Boolean:
                return Json::make_bool(token.text == "true");
            default:
                throw std::runtime_error("Invalid token in condition");
        }
    }

    bool parse_comparison() {
        Json left = parse_value_token();
        if (peek().type == Token::Type::Operator) {
            std::string op = peek().text;
            if (op == "==" || op == "!=" || op == ">" || op == "<" || op == ">=" || op == "<=") {
                get();
                Json right = parse_value_token();
                if (op == "==") return json_equal(left, right);
                if (op == "!=") return !json_equal(left, right);
                double lhs = left.as_number();
                double rhs = right.as_number();
                if (op == ">") return lhs > rhs;
                if (op == "<") return lhs < rhs;
                if (op == ">=") return lhs >= rhs;
                if (op == "<=") return lhs <= rhs;
            }
        }
        return json_truthy(left);
    }
};

struct Node {
    std::string id;
    std::string type;
    Json data;
};

struct Edge {
    std::string id;
    std::string source;
    std::string target;
    std::string source_handle;
};

struct LogEntry {
    std::string node_id;
    std::string node_type;
    std::string label;
    std::string output;
};

struct RuntimeOptions {
    std::string graph_path;
    std::string input_path;
    std::string output_path;
    std::string action_script;
    std::string llm_script;
};

struct CommandResult {
    int exit_code = 0;
    std::string output;
};

class Runtime {
public:
    explicit Runtime(RuntimeOptions options) : options_(std::move(options)) {}

    Json run() {
        load_graph();
        Json input = load_input();
        log_entries_.clear();
        outputs_.clear();

        std::vector<std::string> start_nodes;
        for (const auto &entry : nodes_) {
            if (entry.second.type == "systemInput" || entry.second.type == "input" || entry.second.type == "data") {
                start_nodes.push_back(entry.first);
            }
        }
        if (start_nodes.empty()) {
            throw std::runtime_error("No start nodes found in graph");
        }

        for (const auto &node_id : start_nodes) {
            std::set<std::string> path;
            execute_node(node_id, input, path);
        }

        Json result = Json::make_object({
            {"status", Json::make_string("ok")},
            {"graph", Json::make_string(graph_name_)},
            {"final_output", outputs_.empty() ? Json() : outputs_.back()},
            {"outputs", Json::make_array(outputs_)},
            {"execution_log", build_log_json()},
        });

        if (!options_.output_path.empty()) {
            write_file(options_.output_path, json_to_string(result));
        }
        return result;
    }

private:
    RuntimeOptions options_;
    std::string graph_name_ = "unknown";
    std::map<std::string, Node> nodes_;
    std::vector<Edge> edges_;
    std::vector<LogEntry> log_entries_;
    std::vector<Json> outputs_;

    std::string runtime_dir() const {
        std::string env_dir = get_env("GEDGE_DEVICE_DIR");
        if (!env_dir.empty()) {
            return env_dir;
        }
        if (!options_.output_path.empty()) {
            return parent_dir(options_.output_path);
        }
        if (!options_.graph_path.empty()) {
            return parent_dir(options_.graph_path);
        }
        return ".";
    }

    std::string write_runtime_file(const std::string &name, const std::string &content) const {
        std::string path = join_path(runtime_dir(), name);
        write_file(path, content);
        return path;
    }

    CommandResult run_capture_command(const std::string &command) const {
        CommandResult result;
        FILE *pipe = popen(command.c_str(), "r");
        if (!pipe) {
            result.exit_code = -1;
            result.output = "failed to start command";
            return result;
        }

        char buffer[512];
        while (fgets(buffer, sizeof(buffer), pipe) != nullptr) {
            result.output += buffer;
        }

        int raw_code = pclose(pipe);
        result.exit_code = raw_code;
        result.output = trim(result.output);
        return result;
    }

    void load_graph() {
        Json root = JsonParser(read_file(options_.graph_path)).parse();
        graph_name_ = root.at("name").as_string("graph");

        nodes_.clear();
        for (const auto &item : root.at("nodes").array_value) {
            Node node;
            node.id = item.at("id").as_string();
            node.type = item.at("type").as_string();
            node.data = item.at("data");
            nodes_[node.id] = node;
        }

        edges_.clear();
        for (const auto &item : root.at("edges").array_value) {
            Edge edge;
            edge.id = item.at("id").as_string();
            edge.source = item.at("source").as_string();
            edge.target = item.at("target").as_string();
            edge.source_handle = item.at("sourceHandle").as_string();
            edges_.push_back(edge);
        }
    }

    Json load_input() const {
        if (options_.input_path.empty()) {
            return Json::make_object({});
        }
        return JsonParser(read_file(options_.input_path)).parse();
    }

    Json build_log_json() const {
        std::vector<Json> logs;
        for (const auto &entry : log_entries_) {
            logs.push_back(Json::make_object({
                {"node_id", Json::make_string(entry.node_id)},
                {"type", Json::make_string(entry.node_type)},
                {"label", Json::make_string(entry.label)},
                {"output", Json::make_string(entry.output)},
            }));
        }
        return Json::make_array(std::move(logs));
    }

    std::string node_label(const Node &node) const {
        return node.data.at("label").as_string(node.id);
    }

    Json process_input_node(const Node &node, const Json &input) const {
        std::string input_type = node.data.at("inputType").as_string(node.type == "input" ? "text" : "data");
        Json output = input.is_object() ? input : Json::make_object({});

        if (!input.is_object() && !input.is_null()) {
            if (input.is_string()) {
                output["text"] = Json::make_string(input.as_string());
            } else {
                output["value"] = input;
            }
        }

        output["inputType"] = Json::make_string(input_type);
        output["source_node_id"] = Json::make_string(node.id);
        output["source_node_label"] = Json::make_string(node_label(node));

        if (input_type == "camera") {
            output["type"] = Json::make_string("image");

            if (!output.has("image_path")) {
                std::string image_path = node.data.at("imagePath").as_string(node.data.at("cameraPath").as_string());
                if (!image_path.empty()) {
                    output["image_path"] = Json::make_string(image_path);
                }
            }
            if (!output.has("content")) {
                std::string inline_image = node.data.at("lastImage").as_string();
                if (!inline_image.empty()) {
                    output["content"] = Json::make_string(inline_image);
                }
            }

            Json camera_meta = output.at("camera");
            if (!camera_meta.is_object()) {
                camera_meta = Json::make_object({});
            }
            camera_meta["node_id"] = Json::make_string(node.id);
            camera_meta["label"] = Json::make_string(node_label(node));
            if (output.has("image_path")) {
                camera_meta["image_path"] = output.at("image_path");
            }
            output["camera"] = camera_meta;
            return output;
        }

        if (input_type == "microphone") {
            output["type"] = Json::make_string("audio");
            if (!output.has("audio_path")) {
                std::string audio_path = node.data.at("audioPath").as_string();
                if (!audio_path.empty()) {
                    output["audio_path"] = Json::make_string(audio_path);
                }
            }
            return output;
        }

        if (!output.has("type")) {
            output["type"] = Json::make_string(input_type.empty() ? "data" : input_type);
        }
        return output;
    }

    Json process_logic_node(const Node &node, const Json &input) const {
        std::string logic_type = node.data.at("logic_type").as_string("if");
        if (logic_type == "filter") {
            Json output = apply_logic_filter(node, input);
            output["logic_mode"] = Json::make_string("filter");
            output["logic_node_id"] = Json::make_string(node.id);
            output["logic_node_label"] = Json::make_string(node_label(node));
            return output;
        }
        std::string condition = node.data.at("condition").as_string();
        bool matched = false;
        if (condition.empty() && input.is_object() && input.has("action_or_not")) {
            const Json &gate = input.at("action_or_not");
            if (gate.is_bool()) {
                matched = gate.as_bool(false);
            } else if (gate.is_number()) {
                matched = gate.as_number(0) != 0;
            } else {
                matched = parse_action_or_not_value(gate.as_string(), false);
            }
        } else {
            matched = evaluate_condition(condition, input);
        }
        Json output = input.is_object() ? input : Json::make_object({});
        if (!input.is_object() && !input.is_null()) {
            if (input.is_string()) {
                output["text"] = Json::make_string(input.as_string());
            } else {
                output["value"] = input;
            }
        }
        output["condition_result"] = Json::make_bool(matched);
        output["logic_condition"] = Json::make_string(condition);
        output["logic_node_id"] = Json::make_string(node.id);
        output["logic_node_label"] = Json::make_string(node_label(node));
        return output;
    }

    std::string short_term_memory_path() const {
        return join_path(runtime_dir(), "short_term_memory.json");
    }

    Json load_short_term_memory_entries() const {
        std::string path = short_term_memory_path();
        if (!file_exists(path)) {
            return Json::make_array({});
        }
        try {
            Json parsed = JsonParser(read_file(path)).parse();
            return parsed.is_array() ? parsed : Json::make_array({});
        } catch (...) {
            return Json::make_array({});
        }
    }

    void save_short_term_memory_entries(const Json &entries) const {
        if (!entries.is_array()) {
            return;
        }
        write_file(short_term_memory_path(), json_to_string(entries) + "\n");
    }

    Json query_short_term_memory_entries(const std::string &query, int limit) const {
        Json entries = load_short_term_memory_entries();
        if (!entries.is_array()) {
            return Json::make_array({});
        }

        std::string normalized_query = to_lower(trim(query));
        std::vector<Json> ranked;
        for (auto it = entries.array_value.rbegin(); it != entries.array_value.rend(); ++it) {
            std::string content = to_lower(it->at("content").as_string());
            if (normalized_query.empty() || content.find(normalized_query) != std::string::npos) {
                ranked.push_back(*it);
            }
            if (static_cast<int>(ranked.size()) >= limit) {
                break;
            }
        }

        if (ranked.empty() && !entries.array_value.empty()) {
            for (auto it = entries.array_value.rbegin(); it != entries.array_value.rend() && static_cast<int>(ranked.size()) < limit; ++it) {
                ranked.push_back(*it);
            }
        }
        return Json::make_array(std::move(ranked));
    }

    void append_short_term_memory_entry(const Json &entry) const {
        Json entries = load_short_term_memory_entries();
        if (!entries.is_array()) {
            entries = Json::make_array({});
        }
        entries.array_value.push_back(entry);
        if (entries.array_value.size() > 200) {
            entries.array_value.erase(entries.array_value.begin(), entries.array_value.begin() + static_cast<long>(entries.array_value.size() - 200));
        }
        save_short_term_memory_entries(entries);
    }

    bool has_reachable_node_type(const std::string &node_id, const std::string &target_type, std::set<std::string> *visited_ptr = nullptr) const {
        std::set<std::string> local_visited;
        std::set<std::string> &visited = visited_ptr ? *visited_ptr : local_visited;
        if (visited.find(node_id) != visited.end()) {
            return false;
        }
        visited.insert(node_id);
        for (const auto &edge : outgoing_edges(node_id)) {
            auto it = nodes_.find(edge.target);
            if (it == nodes_.end()) {
                continue;
            }
            if (it->second.type == target_type) {
                return true;
            }
            if (has_reachable_node_type(it->second.id, target_type, &visited)) {
                return true;
            }
        }
        return false;
    }

    Json parse_filter_value(const std::string &raw_value, const Json &context) const {
        std::string value = trim(raw_value);
        if (value.empty()) {
            return Json();
        }
        if ((value.front() == '"' && value.back() == '"') || (value.front() == '\'' && value.back() == '\'')) {
            return Json::make_string(value.substr(1, value.size() - 2));
        }
        if (value == "true") return Json::make_bool(true);
        if (value == "false") return Json::make_bool(false);
        char *end_ptr = nullptr;
        double parsed_number = std::strtod(value.c_str(), &end_ptr);
        if (end_ptr != value.c_str() && end_ptr && *end_ptr == '\0') {
            return Json::make_number(parsed_number);
        }
        if (context.is_object() && context.has(value)) {
            return context.at(value);
        }
        return Json::make_string(value);
    }

    void apply_filter_updates(Json &target, const std::string &rule_text, const Json &context) const {
        std::stringstream stream(rule_text);
        std::string assignment;
        while (std::getline(stream, assignment, ',')) {
            assignment = trim(assignment);
            if (assignment.empty()) {
                continue;
            }
            size_t equal_pos = assignment.find('=');
            if (equal_pos == std::string::npos) {
                continue;
            }
            std::string key = trim(assignment.substr(0, equal_pos));
            std::string value = trim(assignment.substr(equal_pos + 1));
            if (key.empty() || value.empty() || key == value) {
                continue;
            }
            target[key] = parse_filter_value(value, context);
        }
    }

    Json apply_logic_filter(const Node &node, const Json &input) const {
        Json output = input.is_object() ? input : Json::make_object({
            {"value", input}
        });
        std::string condition = node.data.at("condition").as_string("true");
        std::string true_update = node.data.at("true_update").as_string();
        std::string false_update = node.data.at("false_update").as_string();
        std::set<std::string> target_nodes;
        for (const auto &edge : outgoing_edges(node.id)) {
            auto it = nodes_.find(edge.target);
            if (it != nodes_.end() && it->second.type == "car_control") {
                target_nodes.insert(it->second.id);
            }
        }

        if (output.has("parameters") && output.at("parameters").is_object()) {
            Json context = merge_objects(output, output.at("parameters").object_value);
            bool matched = evaluate_condition(condition, context);
            apply_filter_updates(output["parameters"], matched ? true_update : false_update, context);
        }

        if (output.has("actions") && output.at("actions").is_array()) {
            for (auto &item : output["actions"].array_value) {
                if (!item.is_object()) {
                    continue;
                }
                std::string node_id_value = item.at("node_id").as_string();
                if (!target_nodes.empty() && !node_id_value.empty() && target_nodes.find(node_id_value) == target_nodes.end()) {
                    continue;
                }
                Json action_parameters = item.at("parameters");
                if (!action_parameters.is_object()) {
                    action_parameters = Json::make_object({});
                }
                Json context = merge_objects(output, action_parameters.object_value);
                for (const auto &entry : item.object_value) {
                    context[entry.first] = entry.second;
                }
                bool matched = evaluate_condition(condition, context);
                apply_filter_updates(action_parameters, matched ? true_update : false_update, context);
                item["parameters"] = action_parameters;
                apply_filter_updates(item, matched ? true_update : false_update, context);
                item["filter_applied"] = Json::make_bool(matched);
            }
        }

        output["condition_result"] = Json::make_bool(true);
        output["logic_condition"] = Json::make_string(condition);
        return output;
    }

    void log_node(const Node &node, const Json &output) {
        log_entries_.push_back({node.id, node.type, node_label(node), json_to_string(output)});
        outputs_.push_back(output);
        std::cout << "[runtime] node=" << node.id << " type=" << node.type << " output=" << json_to_string(output) << std::endl;
    }

    std::vector<Edge> outgoing_edges(const std::string &node_id) const {
        std::vector<Edge> outgoing;
        for (const auto &edge : edges_) {
            if (edge.source == node_id) {
                outgoing.push_back(edge);
            }
        }
        return outgoing;
    }

    std::vector<Node> reachable_car_control_nodes(const std::string &node_id) const {
        std::vector<Node> collected;
        std::set<std::string> visited;
        collect_reachable_car_controls(node_id, visited, collected);
        return collected;
    }

    void collect_reachable_car_controls(const std::string &node_id, std::set<std::string> &visited, std::vector<Node> &collected) const {
        if (visited.find(node_id) != visited.end()) {
            return;
        }
        visited.insert(node_id);
        for (const auto &edge : outgoing_edges(node_id)) {
            auto it = nodes_.find(edge.target);
            if (it == nodes_.end()) {
                continue;
            }
            const Node &next = it->second;
            if (next.type == "car_control") {
                collected.push_back(next);
            }
            collect_reachable_car_controls(next.id, visited, collected);
        }
    }

    std::string car_control_guidance(const Node &node) const {
        std::string endpoint = node.data.at("endpoint").as_string("control");
        if (endpoint == "signals") {
            return "Call GET /api/vehicle/signals. No extra params.";
        }

        std::string module = node.data.at("module").as_string();
        std::string function_name = node.data.at("function").as_string();
        std::string signal_key = node.data.at("signalKey").as_string();

        if (function_name != "set") {
            return "No set params. Return only node_id for get/subscribe when you want to call it.";
        }

        if (signal_key.find("SEAT_HEAT_STATUS") == 0 || signal_key.find("SEAT_VENTILATION_STATUS") == 0) {
            return "Set Params: level 0-3.";
        }
        if (signal_key == "AMBIENCE_LIGHT_SINGLE_COLOR") {
            return "Set Params: level 1-64.";
        }
        if (signal_key.find("AMBIENCE_LIGHT_EFFECT_") == 0) {
            return "Set Params: level 0-3.";
        }
        if (signal_key == "WINDOW_POSITION") {
            return "Set Params: area 0-6 where 0=all,1=driver,2=passenger,3=rear_left,4=rear_right,5=front_row,6=rear_row; status 0-100 in steps of 10 where 0=closed and 100=open.";
        }
        if (signal_key == "SUNSHADE_SLIDING_OPEN") {
            return "Set Params: area 1-4 where 1=sunroof,2=rear_windshield,3=rear_left,4=rear_right; status 0-1 where 0=closed and 1=open.";
        }
        (void)module;
        return "Follow the interface definition exactly. Only include supported params.";
    }

    std::string car_control_output_template(const Node &node) const {
        std::string endpoint = node.data.at("endpoint").as_string("control");
        std::string function_name = node.data.at("function").as_string();
        std::string signal_key = node.data.at("signalKey").as_string();
        std::ostringstream oss;
        oss << "{\"node_id\":\"" << escape_json(node.id) << "\"";
        if (endpoint == "signals" || function_name == "get" || function_name == "subscribe") {
            oss << "}";
            return oss.str();
        }
        if (signal_key.find("SEAT_HEAT_STATUS") == 0 || signal_key.find("SEAT_VENTILATION_STATUS") == 0 ||
            signal_key.find("AMBIENCE_LIGHT_EFFECT_") == 0) {
            oss << ",\"level\":<0-3>}";
            return oss.str();
        }
        if (signal_key == "AMBIENCE_LIGHT_SINGLE_COLOR") {
            oss << ",\"level\":<1-64>}";
            return oss.str();
        }
        if (signal_key == "WINDOW_POSITION") {
            oss << ",\"area\":<0-6>,\"status\":<0-100 step 10>}";
            return oss.str();
        }
        if (signal_key == "SUNSHADE_SLIDING_OPEN") {
            oss << ",\"area\":<1-4>,\"status\":<0-or-1>}";
            return oss.str();
        }
        oss << "}";
        return oss.str();
    }

    std::string build_parameter_string(const Json &config) const {
        std::ostringstream oss;
        oss << "endpoint=" << config.at("endpoint").as_string("control");
        oss << ",module=" << config.at("module").as_string();
        oss << ",function=" << config.at("function").as_string();
        oss << ",signal=" << config.at("signalKey").as_string();
        if (config.has("level")) {
            oss << ",level=" << static_cast<int>(config.at("level").as_number(0));
        }
        if (config.has("area")) {
            oss << ",area=" << static_cast<int>(config.at("area").as_number(0));
        }
        if (config.has("status")) {
            oss << ",status=" << static_cast<int>(config.at("status").as_number(0));
        }
        return oss.str();
    }

    bool parse_bare_int_arg(const Json &item, int &value) const {
        if (!item.has("args")) {
            return false;
        }
        std::string raw = trim(item.at("args").as_string());
        if (raw.empty()) {
            return false;
        }
        return regex_extract_int(raw, "^([0-9]{1,3})$", value, false);
    }

    Json build_llm_action_catalog(const std::string &node_id) const {
        std::vector<Node> targets = reachable_car_control_nodes(node_id);
        std::vector<Json> entries;
        for (const auto &target : targets) {
            std::map<std::string, Json> entry = {
                {"node_id", Json::make_string(target.id)},
                {"label", Json::make_string(node_label(target))},
                {"endpoint", Json::make_string(target.data.at("endpoint").as_string("control"))},
                {"module", Json::make_string(target.data.at("module").as_string(""))},
                {"function", Json::make_string(target.data.at("function").as_string(""))},
                {"signalKey", Json::make_string(target.data.at("signalKey").as_string(""))},
                {"guidance", Json::make_string(car_control_guidance(target))},
                {"output_template", Json::make_string(car_control_output_template(target))},
            };
            if (target.data.has("level")) {
                entry["default_level"] = target.data.at("level");
            }
            if (target.data.has("area")) {
                entry["default_area"] = target.data.at("area");
            }
            if (target.data.has("status")) {
                entry["default_status"] = target.data.at("status");
            }
            entries.push_back(Json::make_object(std::move(entry)));
        }
        return Json::make_array(std::move(entries));
    }

    std::string build_llm_tool_prompt(const Node &node, const Json &merged, const std::string &user_prompt) const {
        Json catalog = build_llm_action_catalog(node.id);
        if (!catalog.is_array() || catalog.array_value.empty()) {
            return user_prompt;
        }

        std::string base_system = node.data.at("systemPrompt").as_string("You are an in-vehicle command assistant.");
        std::ostringstream oss;
        oss << base_system << "\n\n";
        oss << "You can choose zero or more downstream car_control actions.\n";
        oss << "First decide whether the CURRENT user input itself is asking for a vehicle action.\n";
        oss << "Historical dialogue is only context and must not by itself trigger vehicle actions.\n";
        oss << "Model may choose multiple actions in one response.\n";
        oss << "Return EXACTLY three tagged blocks and nothing else:\n";
        oss << "<action_or_not>0</action_or_not>\n";
        oss << "<reply>short natural language reply for user</reply>\n";
        oss << "<action>{\"actions\":[]}</action>\n";
        oss << "Rules:\n";
        oss << "- Decide <action_or_not> using CURRENT user input only.\n";
        oss << "- Use 1 only when the current user input is explicitly asking to call downstream car_control actions.\n";
        oss << "- Use 0 for memory questions, identity questions, user facts, or normal dialogue.\n";
        oss << "- Never invent node_id, endpoint, module, function, or signalKey.\n";
        oss << "- For each selected action, follow its exact output_template and replace placeholders with actual numeric values.\n";
        oss << "- Prefer structured numeric fields such as level, area, and status. The args field is compatibility fallback only.\n";
        oss << "- For get/subscribe/signals actions, output only the node_id object shown in the template.\n";
        oss << "- If user asks to control multiple interfaces, return multiple action objects.\n";
        oss << "- If <action_or_not> is 0, return <action>{\"actions\":[]}</action>.\n";
        oss << "- The reply block is plain text, not JSON.\n";
        oss << "- The action block must contain valid JSON with an actions array.\n";
        oss << "- Available downstream actions are listed below as JSON. Only choose from these node_id values.\n";
        oss << "Current User Input:\n" << user_prompt << "\n\n";
        oss << "The following content is historical dialogue information, not the current dialogue, request, or action request.\n";
        oss << "Short-term Memory:\n";
        if (merged.has("short_term_memory") && merged.at("short_term_memory").is_array() &&
            !merged.at("short_term_memory").array_value.empty()) {
            for (const auto &entry : merged.at("short_term_memory").array_value) {
                if (!entry.is_object()) {
                    continue;
                }
                std::string content = entry.at("content").as_string();
                if (!content.empty()) {
                    oss << content << "\n";
                }
            }
        } else {
            oss << "(empty)\n";
        }
        oss << "\nAvailable downstream actions:\n";
        oss << json_to_string(catalog) << "\n";
        return oss.str();
    }

    Json parse_llm_plan(const std::string &output) const {
        std::string tagged_action_or_not = extract_tag_content(output, "action_or_not");
        std::string tagged_reply = extract_tag_content(output, "reply");
        std::string tagged_action = extract_tag_content(output, "action");
        if (!tagged_action_or_not.empty() || !tagged_reply.empty() || !tagged_action.empty()) {
            std::map<std::string, Json> plan_map;
            if (!tagged_action_or_not.empty()) {
                plan_map["action_or_not"] = Json::make_bool(parse_action_or_not_value(tagged_action_or_not, false));
                plan_map["action_or_not_raw"] = Json::make_string(tagged_action_or_not);
            }
            plan_map["reply"] = Json::make_string(tagged_reply);
            plan_map["actions"] = Json::make_array({});

            Json action_payload = parse_json_block_or_null(tagged_action);
            if (action_payload.is_object() && action_payload.has("actions") && action_payload.at("actions").is_array()) {
                plan_map["actions"] = action_payload.at("actions");
            } else if (action_payload.is_array()) {
                plan_map["actions"] = action_payload;
            }
            if (plan_map["actions"].is_array() &&
                plan_map["actions"].array_value.size() == 1 &&
                plan_map["actions"].array_value.front().is_object() &&
                plan_map["actions"].array_value.front().has("actions") &&
                plan_map["actions"].array_value.front().at("actions").is_array()) {
                Json nested_actions = plan_map["actions"].array_value.front().at("actions");
                plan_map["actions"] = nested_actions;
            }
            return Json::make_object(std::move(plan_map));
        }

        Json parsed = parse_json_block_or_null(output);
        if (!parsed.is_object()) {
            return Json();
        }
        if (!parsed.has("actions") || !parsed.at("actions").is_array()) {
            parsed["actions"] = Json::make_array({});
        }
        return parsed;
    }

    std::string action_hint_text(const Json &item, const Json &input) const {
        std::vector<std::string> pieces;
        bool has_action_specific_hint = false;
        for (const char *key : {"args", "hint", "parameter"}) {
            if (item.has(key)) {
                std::string value = item.at(key).as_string();
                if (!value.empty()) {
                    pieces.push_back(value);
                    has_action_specific_hint = true;
                }
            }
        }
        if (!has_action_specific_hint) {
            for (const char *key : {"text", "reply", "llm_output"}) {
                if (input.has(key)) {
                    pieces.push_back(input.at(key).as_string());
                }
            }
        }
        std::ostringstream oss;
        bool first = true;
        for (const auto &piece : pieces) {
            if (piece.empty()) {
                continue;
            }
            if (!first) {
                oss << " ";
            }
            oss << piece;
            first = false;
        }
        return oss.str();
    }

    int infer_window_area(const std::string &hint, int fallback) const {
        std::string lower = to_lower(hint);
        if (lower.find("all") != std::string::npos || lower.find("全部") != std::string::npos) return 0;
        if (lower.find("driver") != std::string::npos || lower.find("主驾") != std::string::npos || lower.find("驾驶") != std::string::npos) return 1;
        if (lower.find("passenger") != std::string::npos || lower.find("副驾") != std::string::npos) return 2;
        if (lower.find("rear left") != std::string::npos || lower.find("左后") != std::string::npos) return 3;
        if (lower.find("rear right") != std::string::npos || lower.find("右后") != std::string::npos) return 4;
        if (lower.find("front row") != std::string::npos || lower.find("前排") != std::string::npos) return 5;
        if (lower.find("rear row") != std::string::npos || lower.find("后排") != std::string::npos) return 6;
        int value = fallback;
        if (regex_extract_int(lower, "area\\s*[:=]?\\s*([0-6])", value)) {
            return clamp_int(value, 0, 6);
        }
        return fallback;
    }

    int infer_sunshade_area(const std::string &hint, int fallback) const {
        std::string lower = to_lower(hint);
        if (lower.find("rear windshield") != std::string::npos || lower.find("后挡") != std::string::npos) return 2;
        if (lower.find("rear left") != std::string::npos || lower.find("左后") != std::string::npos) return 3;
        if (lower.find("rear right") != std::string::npos || lower.find("右后") != std::string::npos) return 4;
        if (lower.find("sunroof") != std::string::npos || lower.find("天窗") != std::string::npos || lower.find("遮阳帘") != std::string::npos) return 1;
        int value = fallback;
        if (regex_extract_int(lower, "area\\s*[:=]?\\s*([1-4])", value)) {
            return clamp_int(value, 1, 4);
        }
        return fallback;
    }

    Json normalize_action_config(const Node &node, const Json &item, const Json &input) const {
        Json config = node.data;
        for (const char *key : {"endpoint", "module", "function", "signalKey", "baseUrlTemplate"}) {
            if (item.has(key)) {
                config[key] = item.at(key);
            }
        }

        std::string endpoint = config.at("endpoint").as_string("control");
        std::string function_name = config.at("function").as_string();
        std::string signal_key = config.at("signalKey").as_string();
        std::string hint = action_hint_text(item, input);
        std::string lower_hint = to_lower(hint);

        if (endpoint == "signals" || function_name == "get" || function_name == "subscribe") {
            return config;
        }

        if (signal_key.find("SEAT_HEAT_STATUS") == 0 || signal_key.find("SEAT_VENTILATION_STATUS") == 0 ||
            signal_key.find("AMBIENCE_LIGHT_EFFECT_") == 0 || signal_key == "AMBIENCE_LIGHT_SINGLE_COLOR") {
            int default_level = static_cast<int>(config.at("level").as_number(signal_key == "AMBIENCE_LIGHT_SINGLE_COLOR" ? 32 : 1));
            int level = default_level;
            bool has_explicit_level = item.has("level");
            if (item.has("level")) {
                level = static_cast<int>(item.at("level").as_number(level));
            }
            if (item.has("status")) {
                int candidate = static_cast<int>(item.at("status").as_number(level));
                if (!has_explicit_level || level == default_level) {
                    level = candidate;
                }
            }
            if (!has_explicit_level) {
                int numeric_arg = level;
                if (parse_bare_int_arg(item, numeric_arg)) {
                    level = numeric_arg;
                }
            }
            if (!has_explicit_level) {
                int regex_level = level;
                if (regex_extract_int(hint, "([0-9]{1,3})\\s*(?:档|级|挡)", regex_level) ||
                    regex_extract_int(lower_hint, "level\\s*[:=]?\\s*([0-9]{1,3})", regex_level)) {
                    level = regex_level;
                }
                if (lower_hint.find("off") != std::string::npos || lower_hint.find("关闭") != std::string::npos || lower_hint.find("关掉") != std::string::npos) {
                    level = 0;
                }
            }
            if (signal_key == "AMBIENCE_LIGHT_SINGLE_COLOR") {
                level = clamp_int(level, 1, 64);
            } else {
                level = clamp_int(level, 0, 3);
            }
            config["level"] = Json::make_number(level);
            config["parameter"] = Json::make_string(build_parameter_string(config));
            return config;
        }

        if (signal_key == "WINDOW_POSITION") {
            int area = static_cast<int>(config.at("area").as_number(0));
            int status = static_cast<int>(config.at("status").as_number(0));
            bool has_explicit_area = item.has("area");
            bool has_explicit_status = item.has("status") || item.has("level");
            if (item.has("area")) {
                area = static_cast<int>(item.at("area").as_number(area));
            }
            if (item.has("status")) {
                status = static_cast<int>(item.at("status").as_number(status));
            } else if (item.has("level")) {
                status = static_cast<int>(item.at("level").as_number(status));
            }
            if (!has_explicit_status) {
                int numeric_arg = status;
                if (parse_bare_int_arg(item, numeric_arg)) {
                    status = numeric_arg;
                }
            }
            if (!has_explicit_area) {
                area = infer_window_area(hint, area);
            }
            if (!has_explicit_status) {
                int percent = status;
                if (regex_extract_int(hint, "([0-9]{1,3})\\s*%", percent) ||
                    regex_extract_int(lower_hint, "status\\s*[:=]?\\s*([0-9]{1,3})", percent)) {
                    status = percent;
                }
                if (lower_hint.find("关闭") != std::string::npos || lower_hint.find("close") != std::string::npos || lower_hint.find("shut") != std::string::npos) {
                    status = 0;
                } else if (lower_hint.find("打开") != std::string::npos || lower_hint.find("open") != std::string::npos) {
                    status = 100;
                }
            }
            status = clamp_int(((status + 5) / 10) * 10, 0, 100);
            config["area"] = Json::make_number(area);
            config["status"] = Json::make_number(status);
            config["parameter"] = Json::make_string(build_parameter_string(config));
            return config;
        }

        if (signal_key == "SUNSHADE_SLIDING_OPEN") {
            int area = static_cast<int>(config.at("area").as_number(1));
            int status = static_cast<int>(config.at("status").as_number(0));
            bool has_explicit_area = item.has("area");
            bool has_explicit_status = item.has("status") || item.has("level");
            if (item.has("area")) {
                area = static_cast<int>(item.at("area").as_number(area));
            }
            if (item.has("status")) {
                status = static_cast<int>(item.at("status").as_number(status));
            } else if (item.has("level")) {
                status = static_cast<int>(item.at("level").as_number(status));
            }
            if (!has_explicit_status) {
                int numeric_arg = status;
                if (parse_bare_int_arg(item, numeric_arg)) {
                    status = numeric_arg;
                }
            }
            if (!has_explicit_area) {
                area = infer_sunshade_area(hint, area);
            }
            if (!has_explicit_status) {
                int numeric_status = status;
                if (regex_extract_int(lower_hint, "status\\s*[:=]?\\s*([0-1])", numeric_status)) {
                    status = numeric_status;
                }
                if (lower_hint.find("打开") != std::string::npos || lower_hint.find("open") != std::string::npos) {
                    status = 1;
                } else if (lower_hint.find("关闭") != std::string::npos || lower_hint.find("close") != std::string::npos) {
                    status = 0;
                }
            }
            config["area"] = Json::make_number(clamp_int(area, 1, 4));
            config["status"] = Json::make_number(clamp_int(status, 0, 1));
            config["parameter"] = Json::make_string(build_parameter_string(config));
            return config;
        }

        for (const char *key : {"level", "area", "status"}) {
            if (item.has(key)) {
                config[key] = item.at(key);
            }
        }
        config["parameter"] = Json::make_string(build_parameter_string(config));
        return config;
    }

    Json execute_car_control_from_llm(const Node &node, const Json &input) const {
        const Json &actions = input.at("actions");
        if (!actions.is_array()) {
            return Json();
        }

        std::vector<Json> matched_results;
        for (const auto &item : actions.array_value) {
            if (!item.is_object()) {
                continue;
            }
            if (item.at("node_id").as_string() != node.id) {
                continue;
            }

            Json config = normalize_action_config(node, item, input);

            Json result = invoke_action("car_control", config.at("action").as_string(node.data.at("action").as_string("generic")), config.at("parameter").as_string(node.data.at("parameter").as_string("")), input, config);
            if (result.is_object()) {
                result["selected_by_llm"] = Json::make_bool(true);
                result["planned_action"] = item;
                result["normalized_config"] = config;
            }
            matched_results.push_back(result);
        }

        if (matched_results.empty()) {
            return Json::make_object({
                {"kind", Json::make_string("car_control")},
                {"name", Json::make_string(node.data.at("action").as_string("generic"))},
                {"node_id", Json::make_string(node.id)},
                {"selected_by_llm", Json::make_bool(false)},
                {"adapter_status", Json::make_string("skipped")},
                {"reason", Json::make_string("llm did not select this downstream action")},
            });
        }

        if (matched_results.size() == 1) {
            return matched_results.front();
        }

        return Json::make_object({
            {"kind", Json::make_string("car_control")},
            {"node_id", Json::make_string(node.id)},
            {"selected_by_llm", Json::make_bool(true)},
            {"result_count", Json::make_number(static_cast<double>(matched_results.size()))},
            {"results", Json::make_array(std::move(matched_results))},
        });
    }

    void execute_node(const std::string &node_id, const Json &input, std::set<std::string> &path) {
        if (path.find(node_id) != path.end()) {
            throw std::runtime_error("Cycle detected at node: " + node_id);
        }
        auto it = nodes_.find(node_id);
        if (it == nodes_.end()) {
            return;
        }

        path.insert(node_id);
        const Node &node = it->second;
        Json output = process_node(node, input);
        log_node(node, output);

        for (const auto &edge : outgoing_edges(node_id)) {
            if (node.type == "logic") {
                bool branch_value = output.is_object()
                                        ? output.at("condition_result").as_bool(output.as_bool(false))
                                        : output.as_bool(false);
                if ((edge.source_handle == "true" && branch_value) ||
                    (edge.source_handle == "false" && !branch_value) ||
                    edge.source_handle.empty()) {
                    std::set<std::string> next_path = path;
                    execute_node(edge.target, output, next_path);
                }
            } else {
                std::set<std::string> next_path = path;
                execute_node(edge.target, output, next_path);
            }
        }
    }

    Json process_node(const Node &node, const Json &input) {
        if (node.type == "systemInput" || node.type == "input" || node.type == "data") {
            return process_input_node(node, input);
        }
        if (node.type == "llm") {
            return process_llm(node, input);
        }
        if (node.type == "logic") {
            return process_logic_node(node, input);
        }
        if (node.type == "memory") {
            if (node.data.at("type").as_string() != "buffer") {
                return input;
            }

            if (has_reachable_node_type(node.id, "llm")) {
                Json output = input.is_object() ? input : Json::make_object({
                    {"text", Json::make_string(input.as_string())}
                });
                int limit = static_cast<int>(node.data.at("window").as_number(10));
                output["short_term_memory"] = query_short_term_memory_entries(
                    output.at("text").as_string(output.at("raw_command").as_string()),
                    limit > 0 ? limit : 10
                );
                output["short_term_memory_count"] = Json::make_number(static_cast<double>(output.at("short_term_memory").array_value.size()));
                return output;
            }

            Json output = input.is_object() ? input : Json::make_object({
                {"text", Json::make_string(input.as_string())}
            });
            std::string user_text = output.at("raw_command").as_string(output.at("text").as_string());
            std::string agent_text = output.at("reply").as_string(output.at("llm_output").as_string());
            if (!user_text.empty() || !agent_text.empty()) {
                append_short_term_memory_entry(Json::make_object({
                    {"timestamp", Json::make_number(std::time(nullptr))},
                    {"content", Json::make_string((user_text.empty() ? "" : "User: " + user_text + "\n") + (agent_text.empty() ? "" : "Agent: " + agent_text))},
                    {"node_id", Json::make_string(node.id)},
                }));
                output["short_term_memory_written"] = Json::make_bool(true);
            } else {
                output["short_term_memory_written"] = Json::make_bool(false);
            }
            return output;
        }
        if (node.type == "car_control") {
            Json llm_selected = execute_car_control_from_llm(node, input);
            if (!llm_selected.is_null()) {
                return llm_selected;
            }
            return invoke_action("car_control", node.data.at("action").as_string("generic"), node.data.at("parameter").as_string(""), input, node.data);
        }
        if (node.type == "tool") {
            std::string tool_name = node.data.at("tool_id").as_string(node.data.at("tool").as_string("tool"));
            return invoke_action("tool", tool_name, node.data.at("parameter").as_string(""), input, node.data);
        }
        if (node.type == "tts" || node.type == "output") {
            return input;
        }
        return input;
    }

    bool evaluate_condition(const std::string &condition, const Json &input) const {
        if (condition.empty()) {
            return true;
        }
        std::vector<Token> tokens = ConditionTokenizer(condition).tokenize();
        return ConditionParser(tokens, input).parse_expression();
    }

    Json process_llm(const Node &node, const Json &input) const {
        Json merged = input.is_object() ? input : Json::make_object({
            {"text", Json::make_string(input.as_string())}
        });

        std::string script = options_.llm_script.empty() ? get_env("GEDGE_LLM_SCRIPT") : options_.llm_script;
        if (!script.empty()) {
            std::string mode = "text";
            std::string user_prompt = merged.at("text").as_string(merged.at("raw").as_string("Describe the input."));
            std::string prompt = user_prompt;
            Json available_actions = build_llm_action_catalog(node.id);
            if (!available_actions.is_array() || available_actions.array_value.empty()) {
                if (merged.has("short_term_memory") && merged.at("short_term_memory").is_array() && !merged.at("short_term_memory").array_value.empty()) {
                std::vector<std::string> memory_lines;
                for (const auto &entry : merged.at("short_term_memory").array_value) {
                    std::string content = entry.at("content").as_string();
                    if (!content.empty()) {
                        memory_lines.push_back("- " + content);
                    }
                }
                    if (!memory_lines.empty()) {
                        std::ostringstream memory_context;
                        memory_context << "Short-term Memory:\n";
                        for (const auto &line : memory_lines) {
                            memory_context << line << "\n";
                        }
                        memory_context << "\nCurrent User Input:\n" << prompt;
                        prompt = memory_context.str();
                    }
                }
            }
            std::string image_path = merged.at("image_path").as_string();
            if (image_path.empty() && merged.at("camera").is_object()) {
                image_path = merged.at("camera").at("image_path").as_string();
            }
            std::string audio_path = merged.at("audio_path").as_string();

            if (!image_path.empty()) {
                mode = "vision";
                prompt += " [image:" + image_path + "]";
            } else if (merged.at("type").as_string() == "image" && merged.has("content")) {
                mode = "vision";
                prompt += " [image:inline]";
            } else if (!audio_path.empty()) {
                mode = "audio";
                prompt += " [audio:" + audio_path + "]";
            }

            if (available_actions.is_array() && !available_actions.array_value.empty()) {
                prompt = build_llm_tool_prompt(node, merged, prompt);
            } else {
                std::string system_prompt = node.data.at("systemPrompt").as_string();
                if (!system_prompt.empty()) {
                    prompt = system_prompt + "\n\nUser Input:\n" + prompt;
                }
            }

            std::string prompt_path = write_runtime_file("llm_prompt_" + node.id + ".txt", prompt + "\n");
            CommandResult command_result = run_capture_command(
                script + " " + shell_quote(mode) + " " + shell_quote(prompt_path));

            std::map<std::string, Json> llm_result;
            llm_result["llm_mode"] = Json::make_string(mode);
            llm_result["llm_prompt_path"] = Json::make_string(prompt_path);
            llm_result["llm_adapter_exit_code"] = Json::make_number(command_result.exit_code);
            llm_result["llm_adapter_status"] = Json::make_string(command_result.exit_code == 0 ? "ok" : "failed");
            llm_result["llm_output"] = Json::make_string(command_result.output);
            llm_result["llm_raw_output"] = Json::make_string(command_result.output);
            if (available_actions.is_array() && !available_actions.array_value.empty()) {
                llm_result["available_actions"] = available_actions;
                Json plan = parse_llm_plan(command_result.output);
                if (plan.is_object()) {
                    llm_result["llm_plan_status"] = Json::make_string("parsed");
                    if (plan.has("reply")) {
                        llm_result["llm_output"] = Json::make_string(plan.at("reply").as_string(command_result.output));
                        llm_result["reply"] = Json::make_string(plan.at("reply").as_string());
                    }
                    Json planned_actions = plan.has("actions") && plan.at("actions").is_array()
                        ? plan.at("actions")
                        : Json::make_array({});
                    bool action_or_not = !planned_actions.array_value.empty();
                    if (plan.has("action_or_not")) {
                        const Json &gate = plan.at("action_or_not");
                        if (gate.is_bool()) {
                            action_or_not = gate.as_bool(action_or_not);
                        } else if (gate.is_number()) {
                            action_or_not = gate.as_number(action_or_not ? 1.0 : 0.0) != 0;
                        } else {
                            action_or_not = parse_action_or_not_value(gate.as_string(), action_or_not);
                        }
                    }
                    llm_result["action_or_not"] = Json::make_bool(action_or_not);
                    if (plan.has("action_or_not_raw")) {
                        llm_result["action_or_not_raw"] = plan.at("action_or_not_raw");
                    }
                    if (plan.has("actions") && plan.at("actions").is_array()) {
                        llm_result["raw_actions"] = planned_actions;
                        llm_result["actions"] = action_or_not ? planned_actions : Json::make_array({});
                    } else {
                        llm_result["actions"] = Json::make_array({});
                    }
                    llm_result["llm_plan"] = plan;
                } else {
                    llm_result["llm_plan_status"] = Json::make_string("unparsed");
                    llm_result["actions"] = Json::make_array({});
                }
            }

            std::string lower_output = to_lower(command_result.output);
            if (lower_output.find("medical_emergency") != std::string::npos ||
                lower_output.find("emergency") != std::string::npos) {
                llm_result["intent"] = Json::make_string("medical_emergency");
                llm_result["status"] = Json::make_string("distress");
            } else if (lower_output.find("control_windows") != std::string::npos ||
                       lower_output.find("window") != std::string::npos) {
                llm_result["intent"] = Json::make_string("control_windows");
            } else if (lower_output.find("other") != std::string::npos) {
                llm_result["intent"] = Json::make_string("other");
            }
            if (!user_prompt.empty()) {
                llm_result["text"] = Json::make_string(merged.at("text").as_string(user_prompt));
            }
            return merge_objects(merged, llm_result);
        }

        std::string text = merged.at("text").as_string(merged.at("raw").as_string());
        std::string lower = to_lower(text);
        std::map<std::string, Json> inferred;
        inferred["runtime_note"] = Json::make_string("llm node downgraded to on-device stub");
        inferred["llm_label"] = Json::make_string(node_label(node));

        if (!text.empty()) {
            inferred["text"] = Json::make_string(text);
            if (lower.find("help") != std::string::npos || lower.find("emergency") != std::string::npos ||
                lower.find("dizzy") != std::string::npos || lower.find("120") != std::string::npos) {
                inferred["intent"] = Json::make_string("medical_emergency");
                inferred["status"] = Json::make_string("distress");
            } else if (lower.find("window") != std::string::npos) {
                inferred["intent"] = Json::make_string("control_windows");
            } else if (lower.find("smok") != std::string::npos) {
                inferred["smoking"] = Json::make_bool(true);
            }
        }
        return merge_objects(merged, inferred);
    }

    Json invoke_action(const std::string &kind, const std::string &name, const std::string &parameter, const Json &input, const Json &config = Json()) const {
        std::map<std::string, Json> result = {
            {"kind", Json::make_string(kind)},
            {"name", Json::make_string(name)},
            {"parameter", Json::make_string(parameter)},
            {"input", input},
        };

        std::string script = options_.action_script.empty() ? get_env("GEDGE_ACTION_SCRIPT") : options_.action_script;
        if (!script.empty()) {
            std::string command_env;
            if (config.is_object()) {
                command_env += env_assignment("GEDGE_ACTION_ENDPOINT", config.at("endpoint").as_string("control"));
                command_env += env_assignment("GEDGE_ACTION_MODULE", config.at("module").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_FUNCTION", config.at("function").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_SIGNAL_KEY", config.at("signalKey").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_LEVEL", config.at("level").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_AREA", config.at("area").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_STATUS", config.at("status").as_string(""));
                command_env += env_assignment("GEDGE_ACTION_BASE_URL", config.at("baseUrlTemplate").as_string(""));
            }
            CommandResult command_result = run_capture_command(
                command_env + script + " " + shell_quote(kind) + " " + shell_quote(name) + " " + shell_quote(parameter));
            result["adapter_exit_code"] = Json::make_number(command_result.exit_code);
            result["adapter_status"] = Json::make_string(command_result.exit_code == 0 ? "ok" : "failed");
            result["adapter_output"] = Json::make_string(command_result.output);
        } else {
            result["adapter_status"] = Json::make_string("noop");
        }

        return Json::make_object(std::move(result));
    }

    static std::string shell_quote(const std::string &value) {
        std::string quoted = "'";
        for (char ch : value) {
            if (ch == '\'') {
                quoted += "'\\''";
            } else {
                quoted.push_back(ch);
            }
        }
        quoted += "'";
        return quoted;
    }

    static std::string env_assignment(const std::string &key, const std::string &value) {
        return key + "=" + shell_quote(value) + " ";
    }

    static std::string get_env(const std::string &key) {
        const char *value = std::getenv(key.c_str());
        return value ? std::string(value) : "";
    }
};

static RuntimeOptions parse_args(int argc, char **argv) {
    RuntimeOptions options;
    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        auto need_value = [&](const std::string &flag) -> std::string {
            if (i + 1 >= argc) {
                throw std::runtime_error("Missing value for " + flag);
            }
            return argv[++i];
        };
        if (arg == "--graph") {
            options.graph_path = need_value(arg);
        } else if (arg == "--input") {
            options.input_path = need_value(arg);
        } else if (arg == "--output") {
            options.output_path = need_value(arg);
        } else if (arg == "--action-script") {
            options.action_script = need_value(arg);
        } else if (arg == "--llm-script") {
            options.llm_script = need_value(arg);
        } else if (arg == "--help" || arg == "-h") {
            std::cout << "Usage: minimal_runtime --graph flow.json --input input.json --output result.json "
                         "[--action-script script.sh] [--llm-script script.sh]" << std::endl;
            std::exit(0);
        } else {
            throw std::runtime_error("Unknown argument: " + arg);
        }
    }
    if (options.graph_path.empty()) {
        throw std::runtime_error("--graph is required");
    }
    return options;
}

int main(int argc, char **argv) {
    try {
        RuntimeOptions options = parse_args(argc, argv);
        Runtime runtime(std::move(options));
        Json result = runtime.run();
        std::cout << json_to_string(result) << std::endl;
        return 0;
    } catch (const std::exception &ex) {
        std::cerr << "[runtime][error] " << ex.what() << std::endl;
        return 1;
    }
}
