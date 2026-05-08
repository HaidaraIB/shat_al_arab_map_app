<?php
/**
 * Writes POST body JSON to map-default.json next to this script (same folder as index.html).
 *
 * Token (same value as VITE_MAP_SAVE_TOKEN in your GitHub build) must exist ONLY on the server:
 *   1) Environment variable MAP_SAVE_TOKEN (hPanel / PHP config if your host supports it), or
 *   2) One-line file map-save-secret.txt in THIS folder (create in File Manager — do not commit to git).
 *
 * The SPA does NOT read .env from Hostinger; Vite bakes secrets at npm run build. This PHP file never
 * needs the token hard-coded in GitHub.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$expected = '';
$fromEnv = getenv('MAP_SAVE_TOKEN');
if (is_string($fromEnv) && $fromEnv !== '') {
    $expected = $fromEnv;
} else {
    $secretFile = __DIR__ . DIRECTORY_SEPARATOR . 'map-save-secret.txt';
    if (is_readable($secretFile)) {
        $fromFile = trim((string) file_get_contents($secretFile));
        if ($fromFile !== '') {
            $expected = $fromFile;
        }
    }
}

if ($expected === '') {
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Server token missing: set MAP_SAVE_TOKEN or create map-save-secret.txt next to this script.',
    ]);
    exit;
}

$token = $_SERVER['HTTP_X_MAP_SAVE_TOKEN'] ?? '';
if (!hash_equals($expected, $token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'Forbidden']);
    exit;
}

$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Empty body']);
    exit;
}

$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$target = __DIR__ . DIRECTORY_SEPARATOR . 'map-default.json';
$pretty = json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($pretty === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'JSON encode failed']);
    exit;
}

if (file_put_contents($target, $pretty) === false) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Write failed — check folder permissions']);
    exit;
}

echo json_encode(['ok' => true]);
