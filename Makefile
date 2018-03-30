.PHONY: setup
setup: requirements.txt
	pip install -r requirements.txt

.PHONY: test
test: lint test-unit

.PHONY: test-unit
test-unit:
	python -m unittest discover -p '*_test.py'

.PHONY: lint
lint:
	pycodestyle src
