# 协作开发

首次安装请先看 [团队上手指南](docs/TEAM_GUIDE.md)。公开仓库可直接克隆运行；直接推送分支需要协作者写入权限。

## 分支与 Pull Request

有写入权限时，在原仓库克隆目录操作。没有写入权限时，先在 GitHub 点 **Fork**，克隆自己的 Fork，让 `origin` 指向自己的仓库；开始新任务前通过 Fork 页面 **Sync fork** 更新 `main`。

确认工作区已提交或保存后，从最新 `main` 创建任务分支（将示例分支名改成自己的任务名）：

```sh
git switch main
git pull --ff-only
git switch -c feat/capture-guide
```

修改后先检查差异，再仅暂存本次任务涉及的文件：

```sh
git status --short
git diff
git add -p
git diff --cached
git commit -m "Improve capture guidance"
git push -u origin feat/capture-guide
```

新文件需用 `git add 文件路径` 单独加入。然后在 GitHub 发起面向 **DeelBran-7/SpineSight-XR-Lite → main** 的 Pull Request，说明修改内容、验证结果；涉及界面时附不含私人照片或密钥的截图。Fork 的分支同样可以发起跨仓库 Pull Request。建议请另一位队友检查后由有权限的人合并。避免多人同时在 `main` 上直接修改。

## 验证

在项目根目录执行：

```sh
cd backend
.venv/bin/python -m pytest -q
.venv/bin/python -m pip check
cd ../frontend
npm run typecheck
npm test
npm run build
cd ..
python3.11 -m unittest discover -s scripts -p 'test_*.py'
```

Windows 将后端 Python 路径换成 `.venv\Scripts\python.exe`，最后一行使用 `py -3.11` 替代 `python3.11`。现有 AI 测试模拟 HTTP，不消耗 API 额度。真实模型正例测试需要自行提供 `SPINESIGHT_TEST_POSE_IMAGE`；未提供图片时会明确跳过。拍摄、权限、手机 HTTPS 等体验还需手动验证。

## 提交约定

- 不提交 `.env`、密钥、真实用户照片、虚拟环境、依赖目录或下载的模型。敏感信息只保存在自己的 `backend/.env`。
- 修改依赖时同步相应锁文件：`backend/requirements.lock.txt` 或 `frontend/package-lock.json`。队友拉取后重新运行 `scripts/setup.py`。
- 调整 API 时同步 [接口文档](docs/API_CONTRACT.md)；改变产品行为时同步相关说明。
- 保持“姿态观察教学原型”的产品边界，不把二维指标描述为诊断、Cobb 角或治疗建议。
