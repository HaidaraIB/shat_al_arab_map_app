<?php
/**
 * Writes POST body JSON to map-default.json next to this script (same folder as index.html).
 * Deploy with your static build; set MAP_SAVE_TOKEN on the server or edit $MAP_SAVE_TOKEN below.
 *
 * Hostinger: MultiPHP → Environment variables, or replace CHANGE_ME below after upload.
 * Protect this URL (HTTP auth / IP allowlist) if the token ever appears in the frontend bundle.
 */
declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

$fromEnv = getenv('MAP_SAVE_TOKEN');
/** @var non-empty-string|false $expected */
$expected = is_string($fromEnv) && $fromEnv !== '' ? $fromEnv : 'CHANGE_ME_SET_MAP_SAVE_TOKEN_ON_SERVER';

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
