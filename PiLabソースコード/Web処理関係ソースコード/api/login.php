<?php
/**
 * ログインボーナス管理API
 */

header('Content-Type: application/json; charset=utf-8');

$DATA_FILE = __DIR__ . '/../data/login_dates.json';

// データファイルが存在しない場合は作成
if (!file_exists($DATA_FILE)) {
    file_put_contents($DATA_FILE, json_encode(['dates' => []], JSON_UNESCAPED_UNICODE));
}

// アクションを取得
$action = isset($_GET['action']) ? $_GET['action'] : '';

switch ($action) {
    case 'check':
        // 今日ログイン済みか確認
        $data = json_decode(file_get_contents($DATA_FILE), true);
        $today = date('Y-m-d');
        $logged_in_today = in_array($today, $data['dates'] ?? []);
        echo json_encode(['logged_in_today' => $logged_in_today, 'dates' => $data['dates'] ?? []], JSON_UNESCAPED_UNICODE);
        break;

    case 'login':
        // 今日のログインを記録
        $data = json_decode(file_get_contents($DATA_FILE), true);
        $today = date('Y-m-d');
        if (!in_array($today, $data['dates'] ?? [])) {
            $data['dates'][] = $today;
            // 過去30日分のみ保持
            $data['dates'] = array_slice($data['dates'], -30);
            file_put_contents($DATA_FILE, json_encode($data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }
        echo json_encode(['success' => true, 'dates' => $data['dates']], JSON_UNESCAPED_UNICODE);
        break;

    default:
        echo json_encode(['error' => 'Invalid action'], JSON_UNESCAPED_UNICODE);
        break;
}
